const ChallengeRoomModel = require("../models/challenge-room.model");
const ChallengeGuessModel = require("../models/challenge-guess.model");
const ChallengePlayerModel = require("../models/challenge-player.model");
const IplPlayerModel = require("../models/ipl-player.model");
const {
  getLetterStatuses, countStatuses, xorEncode,
  ENCODE_KEY, WORD_LENGTH, MAX_GUESSES,
} = require("../utils/game-logic");

// In-memory room state keyed by roomCode
const roomSockets = new Map();

function getRoomState(roomCode) {
  if (!roomSockets.has(roomCode)) {
    roomSockets.set(roomCode, {
      creator: null,
      opponent: null,
      answer: null,
      fullName: null,
      playerList: null,
      creatorGuesses: 0,
      opponentGuesses: 0,
      creatorFinished: false,
      opponentFinished: false,
      gameStarted: false,
    });
  }
  return roomSockets.get(roomCode);
}

function cleanupRoom(roomCode) {
  roomSockets.delete(roomCode);
}

async function loadValidPlayerNames() {
  const players = await IplPlayerModel.findAll();
  return new Set(players.map((p) => p.name.toLowerCase()));
}

async function loadMultiModePlayerNames() {
  const players = await ChallengePlayerModel.findAll();
  return new Set(players.map((p) => p.player_name.toLowerCase()));
}

function initChallengeSocket(io) {
  io.on("connection", (socket) => {
    let currentRoom = null;
    let currentRole = null;

    socket.on("join-room", async (data) => {
      try {
        const { roomCode, playerName } = data || {};
        if (!roomCode || !playerName) {
          return socket.emit("room-error", { message: "Room code and player name are required" });
        }

        const trimmedName = playerName.trim().slice(0, 50);
        const nameLower = trimmedName.toLowerCase();

        const room = await ChallengeRoomModel.findByCode(roomCode);
        if (!room) {
          return socket.emit("room-error", { message: "Room not found" });
        }

        if (room.status === "expired") {
          return socket.emit("room-error", { message: "This room has expired" });
        }

        if (room.status === "completed") {
          return socket.emit("room-error", { message: "This game is already finished" });
        }

        const state = getRoomState(roomCode);
        const isCreatorByName = room.creator_name.toLowerCase() === nameLower;
        const isOpponentByName = room.opponent_name && room.opponent_name.toLowerCase() === nameLower;
        const creatorOnline = state.creator && state.creator.connected;

        let role = null;

        if (isCreatorByName && !creatorOnline) {
          // Creator connecting or reconnecting (no active creator socket)
          role = "creator";
          state.creator = socket;
        } else if (isOpponentByName) {
          // Opponent reconnecting (name already in DB)
          if (state.opponent && state.opponent.id !== socket.id && state.opponent.connected) {
            return socket.emit("room-error", { message: "Opponent is already connected" });
          }
          role = "opponent";
          state.opponent = socket;
        } else if (!room.opponent_name || (!isOpponentByName && !state.opponent?.connected)) {
          // New opponent joining — either no opponent set yet, or slot is open
          role = "opponent";
          state.opponent = socket;
          if (!room.opponent_name) {
            await ChallengeRoomModel.setOpponent(roomCode, null, trimmedName);
          }
        } else if (isCreatorByName && creatorOnline) {
          // Same name as creator but creator is online — treat as duplicate name opponent
          if (!state.opponent?.connected) {
            role = "opponent";
            state.opponent = socket;
            if (!room.opponent_name) {
              await ChallengeRoomModel.setOpponent(roomCode, null, trimmedName + " (2)");
            }
          } else {
            return socket.emit("room-error", { message: "Room is full — both slots taken" });
          }
        } else {
          return socket.emit("room-error", { message: "Room is full" });
        }

        currentRole = role;
        currentRoom = roomCode;
        socket.join(roomCode);

        // If game is already active (reconnection mid-game), resend game-start
        if (room.status === "active" && state.gameStarted && state.answer) {
          const encoded = xorEncode(state.answer, ENCODE_KEY);
          const encodedFullName = xorEncode(state.fullName, ENCODE_KEY);
          let hints = room.hints;
          if (typeof hints === "string") {
            try { hints = JSON.parse(hints); } catch { hints = []; }
          }
          const otherName = role === "creator" ? (room.opponent_name || "") : room.creator_name;
          socket.emit("game-start", {
            encoded,
            fullName: encodedFullName,
            hints,
            opponentName: otherName,
            yourRole: role,
            countdown: 0,
          });
          return;
        }

        // Both sockets connected on a waiting room — start the game
        if (state.creator && state.opponent && !state.gameStarted) {
          const challengePlayer = await ChallengePlayerModel.findRandom();
          if (!challengePlayer) {
            io.to(roomCode).emit("room-error", { message: "No challenge players available. Please seed players first." });
            return;
          }

          const answer = challengePlayer.player_name.toLowerCase();
          const encoded = xorEncode(answer, ENCODE_KEY);
          let hints = challengePlayer.hints;
          // #region agent log
          fetch('http://127.0.0.1:7615/ingest/c641f394-8238-49b5-9ef6-2a0c0c5d4763',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'65fd5a'},body:JSON.stringify({sessionId:'65fd5a',location:'challenge-socket.js:hints-raw',message:'hints from DB before parse',data:{hintsType:typeof hints,isString:typeof hints==='string',isArray:Array.isArray(hints),isObject:typeof hints==='object',preview:JSON.stringify(hints).slice(0,300)},timestamp:Date.now(),hypothesisId:'H2-H3'})}).catch(()=>{});
          // #endregion
          if (typeof hints === "string") {
            try { hints = JSON.parse(hints); } catch { hints = []; }
          }
          // #region agent log
          fetch('http://127.0.0.1:7615/ingest/c641f394-8238-49b5-9ef6-2a0c0c5d4763',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'65fd5a'},body:JSON.stringify({sessionId:'65fd5a',location:'challenge-socket.js:hints-parsed',message:'hints after parse',data:{hintsType:typeof hints,isArray:Array.isArray(hints),isObject:typeof hints==='object',preview:JSON.stringify(hints).slice(0,300)},timestamp:Date.now(),hypothesisId:'H2-H3'})}).catch(()=>{});
          // #endregion
          const encodedFullName = xorEncode(challengePlayer.full_name, ENCODE_KEY);

          const freshRoom = await ChallengeRoomModel.findByCode(roomCode);
          const opponentNameDB = freshRoom.opponent_name || trimmedName;

          await ChallengeRoomModel.startGame(
            roomCode,
            challengePlayer.id,
            challengePlayer.player_name,
            challengePlayer.full_name,
            encoded,
            hints
          );

          state.answer = answer;
          state.fullName = challengePlayer.full_name;
          state.gameStarted = true;

          const iplNames = await loadValidPlayerNames();
          const multiNames = await loadMultiModePlayerNames();
          state.playerList = new Set([...iplNames, ...multiNames]);

          state.creator.emit("game-start", {
            encoded,
            fullName: encodedFullName,
            hints,
            opponentName: opponentNameDB,
            yourRole: "creator",
            countdown: 3,
          });
          state.opponent.emit("game-start", {
            encoded,
            fullName: encodedFullName,
            hints,
            opponentName: freshRoom.creator_name,
            yourRole: "opponent",
            countdown: 3,
          });
          return;
        }

        // Only one player connected so far — wait
        socket.emit("waiting", {
          roomCode,
          creatorName: room.creator_name,
          yourRole: role,
        });

        // Notify the other player if they're already connected
        const otherSocket = role === "creator" ? state.opponent : state.creator;
        if (otherSocket) {
          otherSocket.emit("player-joined", { opponentName: trimmedName });
        }
      } catch (err) {
        console.error("join-room error:", err);
        socket.emit("room-error", { message: "Failed to join room" });
      }
    });

    socket.on("submit-guess", async (data) => {
      try {
        const { roomCode, guess } = data || {};
        if (!roomCode || !guess || !currentRole) {
          return socket.emit("room-error", { message: "Invalid guess submission" });
        }

        const state = getRoomState(roomCode);
        if (!state.gameStarted || !state.answer) {
          return socket.emit("room-error", { message: "Game has not started yet" });
        }

        const role = currentRole;
        const isCreator = role === "creator";

        if (isCreator && state.creatorFinished) {
          return socket.emit("room-error", { message: "You have already finished" });
        }
        if (!isCreator && state.opponentFinished) {
          return socket.emit("room-error", { message: "You have already finished" });
        }

        const guessLower = guess.toLowerCase().trim();

        if (guessLower.length !== WORD_LENGTH) {
          return socket.emit("room-error", { message: "Guess must be 5 letters" });
        }

        // Validate guess is in player list
        if (guessLower !== state.answer && state.playerList && !state.playerList.has(guessLower)) {
          return socket.emit("room-error", { message: "Not a valid cricketer name" });
        }

        const guessCount = isCreator ? state.creatorGuesses + 1 : state.opponentGuesses + 1;

        if (guessCount > MAX_GUESSES) {
          return socket.emit("room-error", { message: "No more guesses remaining" });
        }

        const statuses = getLetterStatuses(guessLower, state.answer);
        const { correct, present } = countStatuses(statuses);
        const isCorrect = correct === WORD_LENGTH;

        // Update in-memory state
        if (isCreator) {
          state.creatorGuesses = guessCount;
        } else {
          state.opponentGuesses = guessCount;
        }

        // Persist to database
        const room = await ChallengeRoomModel.findByCode(roomCode);
        await ChallengeGuessModel.create({
          room_id: room.id,
          player_role: role,
          guess: guessLower,
          guess_number: guessCount,
          letter_statuses: statuses,
          correct_count: correct,
          present_count: present,
          is_correct: isCorrect,
        });
        await ChallengeRoomModel.recordGuess(roomCode, role);

        // Send result to guesser
        socket.emit("guess-result", {
          guessNumber: guessCount,
          statuses,
          isCorrect,
        });

        // Notify opponent
        const opponentSocket = isCreator ? state.opponent : state.creator;
        if (opponentSocket) {
          opponentSocket.emit("opponent-guessed", {
            guessNumber: guessCount,
            correctCount: correct,
            presentCount: present,
            totalGuesses: guessCount,
            isCorrect,
          });
        }

        // Check if this player is finished
        const playerFinished = isCorrect || guessCount >= MAX_GUESSES;
        if (playerFinished) {
          if (isCreator) state.creatorFinished = true;
          else state.opponentFinished = true;
          await ChallengeRoomModel.markFinished(roomCode, role);
        }

        // Determine if game is over
        const bothFinished = state.creatorFinished && state.opponentFinished;
        const someoneWon = isCorrect;

        if (someoneWon || bothFinished) {
          let winner = null;

          if (someoneWon && !bothFinished) {
            // The other player might still be playing; wait for them
            // Actually: first correct guess wins immediately
            winner = role;
          } else if (bothFinished) {
            // Both finished — check who won
            const allGuesses = await ChallengeGuessModel.findByRoom(room.id);
            const creatorCorrect = allGuesses.find((g) => g.player_role === "creator" && g.is_correct);
            const opponentCorrect = allGuesses.find((g) => g.player_role === "opponent" && g.is_correct);

            if (creatorCorrect && opponentCorrect) {
              // Both got it — who guessed with fewer attempts wins, or earlier timestamp
              if (state.creatorGuesses < state.opponentGuesses) winner = "creator";
              else if (state.opponentGuesses < state.creatorGuesses) winner = "opponent";
              else winner = "draw";
            } else if (creatorCorrect) {
              winner = "creator";
            } else if (opponentCorrect) {
              winner = "opponent";
            } else {
              winner = "draw";
            }
          }

          if (winner || bothFinished) {
            const finalWinner = winner || "draw";
            await ChallengeRoomModel.setWinner(roomCode, finalWinner);

            // Get full boards for result
            const allGuesses = await ChallengeGuessModel.findByRoom(room.id);
            const creatorBoard = allGuesses
              .filter((g) => g.player_role === "creator")
              .map((g) => ({
                guess: g.guess,
                statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
                isCorrect: !!g.is_correct,
              }));
            const opponentBoard = allGuesses
              .filter((g) => g.player_role === "opponent")
              .map((g) => ({
                guess: g.guess,
                statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
                isCorrect: !!g.is_correct,
              }));

            io.to(roomCode).emit("game-over", {
              winner: finalWinner,
              answer: state.answer,
              fullName: state.fullName,
              creatorName: room.creator_name,
              opponentName: room.opponent_name,
              creatorBoard,
              opponentBoard,
            });

            cleanupRoom(roomCode);
          }
        }
      } catch (err) {
        console.error("submit-guess error:", err);
        socket.emit("room-error", { message: "Failed to process guess" });
      }
    });

    socket.on("disconnect", async () => {
      if (!currentRoom) return;

      const state = roomSockets.get(currentRoom);
      if (!state) return;

      const role = currentRole;

      if (role === "creator") {
        state.creator = null;
      } else if (role === "opponent") {
        state.opponent = null;
      }

      // Notify the other player
      const otherSocket = role === "creator" ? state.opponent : state.creator;
      if (otherSocket) {
        otherSocket.emit("opponent-disconnected", { role });
      }

      // If the game hasn't started and creator left, expire the room
      if (!state.gameStarted && role === "creator") {
        try {
          const room = await ChallengeRoomModel.findByCode(currentRoom);
          if (room && room.status === "waiting") {
            await ChallengeRoomModel.expireOldRooms(0);
          }
        } catch { /* non-critical */ }
        cleanupRoom(currentRoom);
      }

      // If both disconnected during game, clean up
      if (!state.creator && !state.opponent) {
        cleanupRoom(currentRoom);
      }
    });
  });
}

module.exports = { initChallengeSocket };
