const ChallengeRoomModel = require("../models/challenge-room.model");
const ChallengeRoundModel = require("../models/challenge-round.model");
const ChallengeGuessModel = require("../models/challenge-guess.model");
const ChallengePlayerModel = require("../models/challenge-player.model");
const IplPlayerModel = require("../models/ipl-player.model");
const ChallengeConversionModel = require("../models/challenge-conversion.model");
const UserActivityModel = require("../models/user-activity.model");
const {
  getLetterStatuses, countStatuses, xorEncode,
  ENCODE_KEY, WORD_LENGTH, MAX_GUESSES,
} = require("../utils/game-logic");

const roomSockets = new Map();

function getRoomState(roomCode) {
  if (!roomSockets.has(roomCode)) {
    roomSockets.set(roomCode, {
      creator: null,
      opponent: null,
      seriesLength: 1,
      currentRound: 1,
      creatorScore: 0,
      opponentScore: 0,
      creatorReady: false,
      opponentReady: false,
      usedPlayerIds: [],
      usedFullNames: [],
      roundDbId: null,
      answer: null,
      fullName: null,
      playerList: null,
      tokenToFullName: null,
      creatorGuesses: 0,
      opponentGuesses: 0,
      creatorFinished: false,
      opponentFinished: false,
      gameStarted: false,
      // Round 1 result data — kept for retroactive scoring when series is proposed
      roundOneWinner: null,
      roundOneCreatorBoard: null,
      roundOneOpponentBoard: null,
      roundOneAnswer: null,
      roundOneFullName: null,
      // Series proposal state
      pendingProposal: null, // { seriesLength, proposerRole }
    });
  }
  return roomSockets.get(roomCode);
}

function resetRoundState(state) {
  state.answer = null;
  state.fullName = null;
  state.roundDbId = null;
  state.creatorGuesses = 0;
  state.opponentGuesses = 0;
  state.creatorFinished = false;
  state.opponentFinished = false;
  state.creatorReady = false;
  state.opponentReady = false;
  state.gameStarted = false;
}

function cleanupRoom(roomCode) {
  roomSockets.delete(roomCode);
}

function winsNeeded(seriesLength) {
  return Math.ceil(seriesLength / 2);
}

async function loadValidPlayerNames() {
  const players = await IplPlayerModel.findAll();
  return new Set(players.map((p) => p.name.toLowerCase()));
}

async function loadMultiModePlayerNames() {
  const players = await ChallengePlayerModel.findAll();
  return new Set(players.map((p) => p.player_name.toLowerCase()));
}

async function loadTokenToFullNameMap() {
  const [iplPlayers, multiPlayers] = await Promise.all([
    IplPlayerModel.findAll(),
    ChallengePlayerModel.findAll(),
  ]);
  const map = new Map();
  for (const p of iplPlayers) {
    const token = p.name.toLowerCase();
    if (!map.has(token)) map.set(token, []);
    map.get(token).push(p.full_name);
  }
  for (const p of multiPlayers) {
    const token = p.player_name.toLowerCase();
    if (!map.has(token)) map.set(token, []);
    if (!map.get(token).includes(p.full_name)) map.get(token).push(p.full_name);
  }
  return map;
}

async function startNewRound(io, roomCode, state) {
  const challengePlayer = await ChallengePlayerModel.findRandomExcludingByFullName(state.usedFullNames);
  if (!challengePlayer) {
    io.to(roomCode).emit("room-error", { message: "No challenge players available." });
    return false;
  }

  const answer = challengePlayer.player_name.toLowerCase();
  const encoded = xorEncode(answer, ENCODE_KEY);
  let hints = challengePlayer.hints;
  if (typeof hints === "string") {
    try { hints = JSON.parse(hints); } catch { hints = []; }
  }
  const encodedFullName = xorEncode(challengePlayer.full_name, ENCODE_KEY);

  const room = await ChallengeRoomModel.findByCode(roomCode);
  if (!room) return false;

  const roundResult = await ChallengeRoundModel.create({
    room_id: room.id,
    round_number: state.currentRound,
    player_id: challengePlayer.id,
    player_name: challengePlayer.player_name,
    full_name: challengePlayer.full_name,
    encoded,
    hints,
  });

  state.roundDbId = roundResult.insertId;
  state.answer = answer;
  state.fullName = challengePlayer.full_name;
  state.gameStarted = true;
  state.usedPlayerIds.push(challengePlayer.id);
  state.usedFullNames.push(challengePlayer.full_name);

  if (!state.playerList) {
    const iplNames = await loadValidPlayerNames();
    const multiNames = await loadMultiModePlayerNames();
    state.playerList = new Set([...iplNames, ...multiNames]);
    state.tokenToFullName = await loadTokenToFullNameMap();
  }

  if (state.creator) {
    state.creator.emit("game-start", {
      encoded,
      fullName: encodedFullName,
      hints,
      opponentName: room.opponent_name || "",
      yourRole: "creator",
      countdown: 3,
      roundNumber: state.currentRound,
      seriesLength: state.seriesLength,
      creatorScore: state.creatorScore,
      opponentScore: state.opponentScore,
    });
  }
  if (state.opponent) {
    state.opponent.emit("game-start", {
      encoded,
      fullName: encodedFullName,
      hints,
      opponentName: room.creator_name,
      yourRole: "opponent",
      countdown: 3,
      roundNumber: state.currentRound,
      seriesLength: state.seriesLength,
      creatorScore: state.creatorScore,
      opponentScore: state.opponentScore,
    });
  }

  return true;
}

function buildBoards(guessRows) {
  const creatorBoard = guessRows
    .filter((g) => g.player_role === "creator")
    .map((g) => ({
      guess: g.guess,
      statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
      isCorrect: !!g.is_correct,
    }));
  const opponentBoard = guessRows
    .filter((g) => g.player_role === "opponent")
    .map((g) => ({
      guess: g.guess,
      statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
      isCorrect: !!g.is_correct,
    }));
  return { creatorBoard, opponentBoard };
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
        state.seriesLength = room.series_length || 1;
        state.currentRound = room.current_round || 1;
        state.creatorScore = room.creator_score || 0;
        state.opponentScore = room.opponent_score || 0;

        const isCreatorByName = room.creator_name.toLowerCase() === nameLower;
        const isOpponentByName = room.opponent_name && room.opponent_name.toLowerCase() === nameLower;
        const creatorOnline = state.creator && state.creator.connected;

        let role = null;

        if (isCreatorByName && !creatorOnline) {
          role = "creator";
          state.creator = socket;
        } else if (isOpponentByName) {
          if (state.opponent && state.opponent.id !== socket.id && state.opponent.connected) {
            return socket.emit("room-error", { message: "Opponent is already connected" });
          }
          role = "opponent";
          state.opponent = socket;
        } else if (!room.opponent_name || (!isOpponentByName && !state.opponent?.connected)) {
          role = "opponent";
          state.opponent = socket;
          if (!room.opponent_name) {
            await ChallengeRoomModel.setOpponent(roomCode, null, trimmedName);
          }
        } else if (isCreatorByName && creatorOnline) {
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

        // Reconnection mid-game
        if ((room.status === "active" || room.status === "between_rounds") && state.gameStarted && state.answer) {
          const encoded = xorEncode(state.answer, ENCODE_KEY);
          const encodedFullName = xorEncode(state.fullName, ENCODE_KEY);

          const rounds = await ChallengeRoundModel.findByRoomId(room.id);
          const currentRoundDb = rounds.find((r) => r.round_number === state.currentRound);
          let hints = currentRoundDb?.hints || [];
          if (typeof hints === "string") {
            try { hints = JSON.parse(hints); } catch { hints = []; }
          }

          const otherName = role === "creator" ? (room.opponent_name || "") : room.creator_name;

          let previousGuesses = [];
          let opponentGuessesSoFar = 0;
          if (state.roundDbId) {
            const myGuesses = await ChallengeGuessModel.findByRoundAndRole(state.roundDbId, role);
            previousGuesses = myGuesses.map((g) => ({
              guess: g.guess,
              statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
              isCorrect: !!g.is_correct,
            }));
            const opponentRole = role === "creator" ? "opponent" : "creator";
            const opponentRows = await ChallengeGuessModel.findByRoundAndRole(state.roundDbId, opponentRole);
            opponentGuessesSoFar = opponentRows.length;
          }

          socket.emit("game-start", {
            encoded,
            fullName: encodedFullName,
            hints,
            opponentName: otherName,
            yourRole: role,
            countdown: 0,
            previousGuesses,
            opponentGuessCount: opponentGuessesSoFar,
            roundNumber: state.currentRound,
            seriesLength: state.seriesLength,
            creatorScore: state.creatorScore,
            opponentScore: state.opponentScore,
          });
          return;
        }

        // Between-rounds reconnection
        if (room.status === "between_rounds" && !state.gameStarted) {
          const otherName = role === "creator" ? (room.opponent_name || "") : room.creator_name;
          const myReady = role === "creator" ? state.creatorReady : state.opponentReady;
          const theirReady = role === "creator" ? state.opponentReady : state.creatorReady;
          socket.emit("between-rounds", {
            roomCode,
            yourRole: role,
            opponentName: otherName,
            roundNumber: state.currentRound,
            seriesLength: state.seriesLength,
            creatorScore: state.creatorScore,
            opponentScore: state.opponentScore,
            youReady: myReady,
            opponentReady: theirReady,
          });
          return;
        }

        // Both sockets connected on a waiting room — start round 1
        if (state.creator && state.opponent && !state.gameStarted) {
          await ChallengeRoomModel.startGame(roomCode);

          const deviceId = (data.deviceId || "").slice(0, 64);
          if (deviceId) {
            const uid = role === "creator" ? (room.creator_user_id || null) : (room.opponent_user_id || null);
            UserActivityModel.upsert(deviceId, uid, "challenge").catch(() => {});
          }

          const ok = await startNewRound(io, roomCode, state);
          if (!ok) return;
          return;
        }

        socket.emit("waiting", {
          roomCode,
          creatorName: room.creator_name,
          yourRole: role,
        });

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

        if (guessLower !== state.answer && state.playerList && !state.playerList.has(guessLower)) {
          return socket.emit("room-error", { message: "Not a valid cricketer name" });
        }

        const guessCount = isCreator ? state.creatorGuesses + 1 : state.opponentGuesses + 1;

        if (guessCount > MAX_GUESSES) {
          return socket.emit("room-error", { message: "No more guesses remaining" });
        }

        let statuses = getLetterStatuses(guessLower, state.answer);
        let { correct, present } = countStatuses(statuses);
        let isCorrect = correct === WORD_LENGTH;

        if (!isCorrect && guessLower !== state.answer && state.tokenToFullName && state.fullName) {
          const guessFullNames = state.tokenToFullName.get(guessLower) || [];
          if (guessFullNames.includes(state.fullName)) {
            statuses = Array(WORD_LENGTH).fill("correct");
            correct = WORD_LENGTH;
            present = 0;
            isCorrect = true;
          }
        }

        if (isCreator) {
          state.creatorGuesses = guessCount;
        } else {
          state.opponentGuesses = guessCount;
        }

        // Respond immediately
        socket.emit("guess-result", {
          guessNumber: guessCount,
          statuses,
          isCorrect,
        });

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

        // Persist
        const room = await ChallengeRoomModel.findByCode(roomCode);
        await ChallengeGuessModel.create({
          room_id: room.id,
          round_id: state.roundDbId,
          player_role: role,
          guess: guessLower,
          guess_number: guessCount,
          letter_statuses: statuses,
          correct_count: correct,
          present_count: present,
          is_correct: isCorrect,
        });
        ChallengeRoundModel.recordGuess(state.roundDbId, role).catch((err) =>
          console.error("recordGuess fire-and-forget error:", err)
        );

        const playerFinished = isCorrect || guessCount >= MAX_GUESSES;
        if (playerFinished) {
          if (isCreator) state.creatorFinished = true;
          else state.opponentFinished = true;
          await ChallengeRoundModel.markFinished(state.roundDbId, role);
        }

        const bothFinished = state.creatorFinished && state.opponentFinished;
        const someoneWon = isCorrect;

        if (someoneWon || bothFinished) {
          let roundWinner = null;

          if (someoneWon && !bothFinished) {
            roundWinner = role;
          } else if (bothFinished) {
            const allGuesses = await ChallengeGuessModel.findByRound(state.roundDbId);
            const creatorCorrect = allGuesses.find((g) => g.player_role === "creator" && g.is_correct);
            const opponentCorrect = allGuesses.find((g) => g.player_role === "opponent" && g.is_correct);

            if (creatorCorrect && opponentCorrect) {
              if (state.creatorGuesses < state.opponentGuesses) roundWinner = "creator";
              else if (state.opponentGuesses < state.creatorGuesses) roundWinner = "opponent";
              else roundWinner = "draw";
            } else if (creatorCorrect) {
              roundWinner = "creator";
            } else if (opponentCorrect) {
              roundWinner = "opponent";
            } else {
              roundWinner = "draw";
            }
          }

          if (roundWinner || bothFinished) {
            const finalRoundWinner = roundWinner || "draw";
            await ChallengeRoundModel.setWinner(state.roundDbId, finalRoundWinner);

            const roundGuesses = await ChallengeGuessModel.findByRound(state.roundDbId);
            const { creatorBoard, opponentBoard } = buildBoards(roundGuesses);

            const winnerBoard = finalRoundWinner === "creator" ? creatorBoard
              : finalRoundWinner === "opponent" ? opponentBoard : null;
            const winningGuess = winnerBoard?.find((g) => g.isCorrect);
            const aliasWord = (winningGuess && winningGuess.guess !== state.answer)
              ? state.answer.toUpperCase() : null;

            // Is this a standalone game (series_length=1) or a mid-series round?
            if (state.seriesLength === 1) {
              // Standalone game — emit game-over, but do NOT cleanupRoom.
              // Keep state alive so players can propose a series.
              state.roundOneWinner = finalRoundWinner;
              state.roundOneCreatorBoard = creatorBoard;
              state.roundOneOpponentBoard = opponentBoard;
              state.roundOneAnswer = state.answer;
              state.roundOneFullName = state.fullName;

              ChallengeConversionModel.create(roomCode).catch(() => {});

              io.to(roomCode).emit("game-over", {
                winner: finalRoundWinner,
                answer: state.answer,
                fullName: state.fullName,
                creatorName: room.creator_name,
                opponentName: room.opponent_name,
                creatorBoard,
                opponentBoard,
                aliasWord,
              });
              // Room stays alive for series proposal
            } else {
              // Mid-series round
              if (finalRoundWinner === "creator") {
                state.creatorScore++;
                await ChallengeRoomModel.updateScore(roomCode, "creator");
              } else if (finalRoundWinner === "opponent") {
                state.opponentScore++;
                await ChallengeRoomModel.updateScore(roomCode, "opponent");
              }

              const needed = winsNeeded(state.seriesLength);
              const seriesOver = state.creatorScore >= needed || state.opponentScore >= needed
                || state.currentRound >= state.seriesLength;

              if (seriesOver) {
                let seriesWinner;
                if (state.creatorScore > state.opponentScore) seriesWinner = "creator";
                else if (state.opponentScore > state.creatorScore) seriesWinner = "opponent";
                else seriesWinner = "draw";

                await ChallengeRoomModel.setWinner(roomCode, seriesWinner);

                io.to(roomCode).emit("series-over", {
                  seriesWinner,
                  roundWinner: finalRoundWinner,
                  roundNumber: state.currentRound,
                  seriesLength: state.seriesLength,
                  creatorScore: state.creatorScore,
                  opponentScore: state.opponentScore,
                  answer: state.answer,
                  fullName: state.fullName,
                  creatorName: room.creator_name,
                  opponentName: room.opponent_name,
                  creatorBoard,
                  opponentBoard,
                  aliasWord,
                });

                cleanupRoom(roomCode);
              } else {
                const roundAnswer = state.answer;
                const roundFullName = state.fullName;
                const completedRound = state.currentRound;

                await ChallengeRoomModel.setBetweenRounds(roomCode);
                resetRoundState(state);
                state.currentRound = completedRound + 1;

                io.to(roomCode).emit("round-over", {
                  roundWinner: finalRoundWinner,
                  roundNumber: completedRound,
                  seriesLength: state.seriesLength,
                  creatorScore: state.creatorScore,
                  opponentScore: state.opponentScore,
                  answer: roundAnswer,
                  fullName: roundFullName,
                  creatorName: room.creator_name,
                  opponentName: room.opponent_name,
                  creatorBoard,
                  opponentBoard,
                  aliasWord,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("submit-guess error:", err);
        socket.emit("room-error", { message: "Failed to process guess" });
      }
    });

    // Player proposes a series from the result screen
    socket.on("propose-series", async (data) => {
      try {
        const { roomCode, seriesLength } = data || {};
        if (!roomCode || !currentRole) return;
        if (seriesLength !== 3 && seriesLength !== 5) return;

        const state = roomSockets.get(roomCode);
        if (!state) return;
        if (state.seriesLength > 1) return; // series already active
        if (!state.roundOneWinner) return; // game hasn't ended yet

        state.pendingProposal = { seriesLength, proposerRole: currentRole };
        state.declinedRoles = null;

        ChallengeConversionModel.markProposed(roomCode).catch(() => {});

        const room = await ChallengeRoomModel.findByCode(roomCode);
        const proposerName = currentRole === "creator" ? room.creator_name : room.opponent_name;

        const otherSocket = currentRole === "creator" ? state.opponent : state.creator;
        if (otherSocket) {
          otherSocket.emit("series-proposed", {
            seriesLength,
            proposerName,
          });
        }

        socket.emit("proposal-sent", { seriesLength });
      } catch (err) {
        console.error("propose-series error:", err);
      }
    });

    // Other player accepts the series proposal
    socket.on("accept-series", async (data) => {
      try {
        const { roomCode } = data || {};
        if (!roomCode || !currentRole) return;

        const state = roomSockets.get(roomCode);
        if (!state || !state.pendingProposal) return;

        const { seriesLength } = state.pendingProposal;
        state.seriesLength = seriesLength;
        state.pendingProposal = null;

        ChallengeConversionModel.markAccepted(roomCode, seriesLength).catch(() => {});

        // Retroactively score Round 1
        if (state.roundOneWinner === "creator") {
          state.creatorScore = 1;
          state.opponentScore = 0;
        } else if (state.roundOneWinner === "opponent") {
          state.creatorScore = 0;
          state.opponentScore = 1;
        } else {
          state.creatorScore = 0;
          state.opponentScore = 0;
        }

        // Persist to DB
        await ChallengeRoomModel.setSeriesLength(roomCode, seriesLength);
        if (state.creatorScore > 0) await ChallengeRoomModel.updateScore(roomCode, "creator");
        if (state.opponentScore > 0) await ChallengeRoomModel.updateScore(roomCode, "opponent");

        // Reset per-round state for round 2
        resetRoundState(state);
        state.currentRound = 2;

        // Notify both: series accepted, show scoreboard, wait for ready
        io.to(roomCode).emit("series-accepted", {
          seriesLength,
          creatorScore: state.creatorScore,
          opponentScore: state.opponentScore,
          currentRound: 2,
        });
      } catch (err) {
        console.error("accept-series error:", err);
        socket.emit("room-error", { message: "Failed to accept series" });
      }
    });

    // Other player declines the series proposal
    socket.on("decline-series", async (data) => {
      try {
        const { roomCode } = data || {};
        if (!roomCode || !currentRole) return;

        const state = roomSockets.get(roomCode);
        if (!state) return;

        state.pendingProposal = null;

        if (!state.declinedRoles) state.declinedRoles = new Set();
        state.declinedRoles.add(currentRole);

        const otherSocket = currentRole === "creator" ? state.opponent : state.creator;
        if (otherSocket) {
          otherSocket.emit("series-declined");
        }

        if (state.declinedRoles.size >= 2) {
          cleanupRoom(roomCode);
        }
      } catch (err) {
        console.error("decline-series error:", err);
      }
    });

    socket.on("ready-next-round", async (data) => {
      try {
        const { roomCode } = data || {};
        if (!roomCode || !currentRole) return;

        const state = roomSockets.get(roomCode);
        if (!state) return;

        if (currentRole === "creator") state.creatorReady = true;
        else state.opponentReady = true;

        const otherSocket = currentRole === "creator" ? state.opponent : state.creator;
        if (otherSocket) {
          otherSocket.emit("opponent-ready", { role: currentRole });
        }

        if (state.creatorReady && state.opponentReady) {
          await ChallengeRoomModel.advanceRound(roomCode);
          const ok = await startNewRound(io, roomCode, state);
          if (!ok) return;
        }
      } catch (err) {
        console.error("ready-next-round error:", err);
        socket.emit("room-error", { message: "Failed to start next round" });
      }
    });

    socket.on("disconnect", async () => {
      if (!currentRoom) return;

      const state = roomSockets.get(currentRoom);
      if (!state) return;

      const role = currentRole;
      const roomCode = currentRoom;

      if (role === "creator") {
        state.creator = null;
      } else if (role === "opponent") {
        state.opponent = null;
      }

      const otherSocket = role === "creator" ? state.opponent : state.creator;
      if (otherSocket) {
        otherSocket.emit("opponent-disconnected", { role });
      }

      if (!state.gameStarted && state.currentRound === 1 && !state.roundOneWinner && role === "creator") {
        try {
          const room = await ChallengeRoomModel.findByCode(roomCode);
          if (room && room.status === "waiting") {
            await ChallengeRoomModel.expireOldRooms(0);
          }
        } catch { /* non-critical */ }
        cleanupRoom(roomCode);
        return;
      }

      if (!state.creator && !state.opponent) {
        cleanupRoom(roomCode);
        return;
      }

      // Post-game disconnect: if game ended and no series active, clean up after timeout
      if (state.roundOneWinner && state.seriesLength === 1) {
        setTimeout(() => {
          const s = roomSockets.get(roomCode);
          if (s && (!s.creator || !s.opponent) && s.seriesLength === 1) {
            cleanupRoom(roomCode);
          }
        }, 30000);
      }
    });
  });
}

module.exports = { initChallengeSocket };
