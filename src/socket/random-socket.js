const RandomChallengeRoomModel = require("../models/random-challenge-room.model");
const RandomChallengeRoundModel = require("../models/random-challenge-round.model");
const RandomChallengeGuessModel = require("../models/random-challenge-guess.model");
const ChallengePlayerModel = require("../models/challenge-player.model");
const IplPlayerModel = require("../models/ipl-player.model");
const UserActivityModel = require("../models/user-activity.model");
const matchmaker = require("../services/random-matchmaker");
const { isOldHumanPlayer } = require("../services/random-bot-player-stats");
const {
  getLetterStatuses, countStatuses, xorEncode,
  ENCODE_KEY, WORD_LENGTH, MAX_GUESSES,
} = require("../utils/game-logic");

const roomSockets = new Map();

// Bot pacing constants
const HUMAN_GUESS_PRIOR_SEC = 12;
const BOT_DELAY_OFFSET_MIN_SEC = 2;
const BOT_DELAY_OFFSET_MAX_SEC = 5;
const BOT_DELAY_MIN_SEC = 5;
const BOT_DELAY_MAX_SEC = 25;
const BOT_DELAY_JITTER_SEC = 1.5;
const BOT_WIN_PROBABILITY = 0.2;

/**
 * Map between internal player_a/player_b (DB) and client-facing creator/opponent (component).
 * player_a == creator (the player matched first / head of queue).
 */
function clientRole(abRole) {
  return abRole === "player_a" ? "creator" : "opponent";
}
function abRole(uiRole) {
  return uiRole === "creator" ? "player_a" : "player_b";
}

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
      roundOneWinner: null,
      roundOneCreatorBoard: null,
      roundOneOpponentBoard: null,
      roundOneAnswer: null,
      roundOneFullName: null,
      pendingProposal: null,
      declinedRoles: null,
      roundEnded: false,
      // Bot fields
      isBotMatch: false,
      botPersona: null,
      humanUserId: null,
      humanIsOldPlayer: false,
      botSubmittedTokens: new Set(),
      humanGuessTimes: [],
      roundStartMs: 0,
      botGuessTimer: null,
      allowBotCorrectWin: false,
    });
  }
  return roomSockets.get(roomCode);
}

function clearBotTimer(state) {
  if (state && state.botGuessTimer) {
    clearTimeout(state.botGuessTimer);
    state.botGuessTimer = null;
  }
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
  state.roundEnded = false;
  // Per-round bot fields (botSubmittedTokens persists across whole match)
  state.humanGuessTimes = [];
  state.roundStartMs = 0;
  state.allowBotCorrectWin = false;
  clearBotTimer(state);
}

function cleanupRoom(roomCode) {
  const state = roomSockets.get(roomCode);
  clearBotTimer(state);
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

async function startNewRound(nsp, roomCode, state) {
  const challengePlayer = await ChallengePlayerModel.findRandomExcludingByFullName(state.usedFullNames);
  if (!challengePlayer) {
    nsp.to(roomCode).emit("room-error", { message: "No challenge players available." });
    return false;
  }

  const answer = challengePlayer.player_name.toLowerCase();
  const encoded = xorEncode(answer, ENCODE_KEY);
  let hints = challengePlayer.hints;
  if (typeof hints === "string") {
    try { hints = JSON.parse(hints); } catch { hints = []; }
  }
  const encodedFullName = xorEncode(challengePlayer.full_name, ENCODE_KEY);

  const room = await RandomChallengeRoomModel.findByCode(roomCode);
  if (!room) return false;

  const roundResult = await RandomChallengeRoundModel.create({
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
  state.roundEnded = false;
  state.roundStartMs = Date.now();
  state.usedPlayerIds.push(challengePlayer.id);
  state.usedFullNames.push(challengePlayer.full_name);

  if (!state.playerList) {
    const iplNames = await loadValidPlayerNames();
    const multiNames = await loadMultiModePlayerNames();
    state.playerList = new Set([...iplNames, ...multiNames]);
    state.tokenToFullName = await loadTokenToFullNameMap();
  }

  if (state.isBotMatch) {
    state.allowBotCorrectWin = state.humanIsOldPlayer && Math.random() < BOT_WIN_PROBABILITY;
    scheduleNextBotGuess(nsp, roomCode);
  }

  if (state.creator) {
    state.creator.emit("game-start", {
      encoded,
      fullName: encodedFullName,
      hints,
      opponentName: room.player_b_name || "",
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
      opponentName: room.player_a_name,
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
    .filter((g) => g.player_role === "player_a")
    .map((g) => ({
      guess: g.guess,
      statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
      isCorrect: !!g.is_correct,
    }));
  const opponentBoard = guessRows
    .filter((g) => g.player_role === "player_b")
    .map((g) => ({
      guess: g.guess,
      statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
      isCorrect: !!g.is_correct,
    }));
  return { creatorBoard, opponentBoard };
}

// ─── Bot helpers ─────────────────────────────────────────────────────────

function getHumanAvgGuessSec(state) {
  if (!state.humanGuessTimes || state.humanGuessTimes.length === 0) {
    return HUMAN_GUESS_PRIOR_SEC;
  }
  const last = state.humanGuessTimes[state.humanGuessTimes.length - 1];
  const start = state.roundStartMs || last;
  const elapsedSec = Math.max(0, (last - start) / 1000);
  // Average seconds-per-guess across the round so far. Floor at 2s so a
  // bizarre 0ms reading can't push the bot below the global 5s clamp via
  // the offset alone.
  return Math.max(2, elapsedSec / state.humanGuessTimes.length);
}

function computeBotDelayMs(state) {
  const avg = getHumanAvgGuessSec(state);
  const offset = BOT_DELAY_OFFSET_MIN_SEC
    + Math.random() * (BOT_DELAY_OFFSET_MAX_SEC - BOT_DELAY_OFFSET_MIN_SEC);
  const jitter = (Math.random() - 0.5) * BOT_DELAY_JITTER_SEC;
  const sec = Math.max(BOT_DELAY_MIN_SEC, Math.min(BOT_DELAY_MAX_SEC, avg + offset + jitter));
  return Math.round(sec * 1000);
}

function pickBotGuess(state) {
  if (!state.playerList) return null;
  const used = state.botSubmittedTokens || new Set();
  const allowCorrect = !!state.allowBotCorrectWin;
  const fullName = state.fullName;
  const tokenToFullName = state.tokenToFullName;

  const candidates = [];
  for (const token of state.playerList) {
    if (typeof token !== "string" || token.length !== WORD_LENGTH) continue;
    if (used.has(token)) continue;
    if (!allowCorrect) {
      if (token === state.answer) continue;
      const aliasFulls = tokenToFullName ? (tokenToFullName.get(token) || []) : [];
      if (fullName && aliasFulls.includes(fullName)) continue;
    }
    candidates.push(token);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function scheduleNextBotGuess(nsp, roomCode) {
  const state = roomSockets.get(roomCode);
  if (!state || !state.isBotMatch) return;
  if (!state.gameStarted || state.opponentFinished || state.creatorFinished) {
    clearBotTimer(state);
    return;
  }
  clearBotTimer(state);
  const delayMs = computeBotDelayMs(state);
  state.botGuessTimer = setTimeout(() => {
    state.botGuessTimer = null;
    fireBotGuess(nsp, roomCode).catch((err) =>
      console.error("[random] bot guess error:", err)
    );
  }, delayMs);
}

async function fireBotGuess(nsp, roomCode) {
  const state = roomSockets.get(roomCode);
  if (!state || !state.isBotMatch) return;
  if (!state.gameStarted || state.opponentFinished || state.creatorFinished) return;

  const guess = pickBotGuess(state);
  if (!guess) return;

  const room = await RandomChallengeRoomModel.findByCode(roomCode);
  if (!room) return;

  state.botSubmittedTokens.add(guess);
  await applyGuess({ nsp, roomCode, room, state, role: "opponent", guess, isBot: true });

  // If the round is still going (human hasn't won, bot hasn't finished),
  // chain the next bot guess so the bot keeps pace even if the human stalls.
  const after = roomSockets.get(roomCode);
  if (after && after.isBotMatch && after.gameStarted
      && !after.opponentFinished && !after.creatorFinished) {
    scheduleNextBotGuess(nsp, roomCode);
  }
}

// ─── Shared guess application ────────────────────────────────────────────

/**
 * Applies a guess for either the human (via socket "submit-guess") or the
 * bot (via fireBotGuess). Mirrors the legacy submit-guess flow exactly so
 * there is a single source of truth for round-completion + emits.
 */
async function applyGuess({ nsp, roomCode, room, state, role, guess, isBot }) {
  // Round may have ended during an await — drop the guess silently. This
  // protects against the human submitting concurrently with a bot guess
  // that just clinched (or vice versa) and double-emitting game-over.
  if (state.roundEnded) return;

  const isCreator = role === "creator";
  const guessLower = guess.toLowerCase().trim();
  const guessCount = isCreator ? state.creatorGuesses + 1 : state.opponentGuesses + 1;

  if (guessCount > MAX_GUESSES) return;

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

  if (isCreator) state.creatorGuesses = guessCount;
  else state.opponentGuesses = guessCount;

  const guesserSocket = isCreator ? state.creator : state.opponent;
  if (!isBot && guesserSocket) {
    guesserSocket.emit("guess-result", {
      guessNumber: guessCount,
      statuses,
      isCorrect,
    });
  }

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

  await RandomChallengeGuessModel.create({
    room_id: room.id,
    round_id: state.roundDbId,
    player_role: abRole(role),
    guess: guessLower,
    guess_number: guessCount,
    letter_statuses: statuses,
    correct_count: correct,
    present_count: present,
    is_correct: isCorrect,
  });
  RandomChallengeRoundModel.recordGuess(state.roundDbId, abRole(role)).catch((err) =>
    console.error("[random] recordGuess error:", err)
  );

  const playerFinished = isCorrect || guessCount >= MAX_GUESSES;
  if (playerFinished) {
    if (isCreator) state.creatorFinished = true;
    else state.opponentFinished = true;
    await RandomChallengeRoundModel.markFinished(state.roundDbId, abRole(role));
  }

  const bothFinished = state.creatorFinished && state.opponentFinished;
  const someoneWon = isCorrect;

  if (someoneWon || bothFinished) {
    let roundWinner = null; // "creator" | "opponent" | "draw"

    if (someoneWon && !bothFinished) {
      roundWinner = role;
    } else if (bothFinished) {
      const allGuesses = await RandomChallengeGuessModel.findByRound(state.roundDbId);
      const aCorrect = allGuesses.find((g) => g.player_role === "player_a" && g.is_correct);
      const bCorrect = allGuesses.find((g) => g.player_role === "player_b" && g.is_correct);

      if (aCorrect && bCorrect) {
        if (state.creatorGuesses < state.opponentGuesses) roundWinner = "creator";
        else if (state.opponentGuesses < state.creatorGuesses) roundWinner = "opponent";
        else roundWinner = "draw";
      } else if (aCorrect) {
        roundWinner = "creator";
      } else if (bCorrect) {
        roundWinner = "opponent";
      } else {
        roundWinner = "draw";
      }
    }

    if (roundWinner || bothFinished) {
      // Mark synchronously so a concurrent guess application drops out at
      // the top of applyGuess instead of double-emitting round-end.
      state.roundEnded = true;

      const finalRoundWinner = roundWinner || "draw";
      const dbRoundWinner = finalRoundWinner === "draw" ? "draw" : abRole(finalRoundWinner);
      await RandomChallengeRoundModel.setWinner(state.roundDbId, dbRoundWinner);

      const roundGuesses = await RandomChallengeGuessModel.findByRound(state.roundDbId);
      const { creatorBoard, opponentBoard } = buildBoards(roundGuesses);

      const winnerBoard = finalRoundWinner === "creator" ? creatorBoard
        : finalRoundWinner === "opponent" ? opponentBoard : null;
      const winningGuess = winnerBoard?.find((g) => g.isCorrect);
      const aliasWord = (winningGuess && winningGuess.guess !== state.answer)
        ? state.answer.toUpperCase() : null;

      // Round is over — bot stops guessing for this round regardless of outcome.
      clearBotTimer(state);

      if (state.seriesLength === 1) {
        state.roundOneWinner = finalRoundWinner;
        state.roundOneCreatorBoard = creatorBoard;
        state.roundOneOpponentBoard = opponentBoard;
        state.roundOneAnswer = state.answer;
        state.roundOneFullName = state.fullName;

        nsp.to(roomCode).emit("game-over", {
          winner: finalRoundWinner,
          answer: state.answer,
          fullName: state.fullName,
          creatorName: room.player_a_name,
          opponentName: room.player_b_name,
          creatorBoard,
          opponentBoard,
          aliasWord,
        });
      } else {
        if (finalRoundWinner === "creator") {
          state.creatorScore++;
          await RandomChallengeRoomModel.updateScore(roomCode, "player_a");
        } else if (finalRoundWinner === "opponent") {
          state.opponentScore++;
          await RandomChallengeRoomModel.updateScore(roomCode, "player_b");
        }

        const needed = winsNeeded(state.seriesLength);
        const seriesOver = state.creatorScore >= needed || state.opponentScore >= needed
          || state.currentRound >= state.seriesLength;

        if (seriesOver) {
          let seriesWinner; // "creator" | "opponent" | "draw"
          if (state.creatorScore > state.opponentScore) seriesWinner = "creator";
          else if (state.opponentScore > state.creatorScore) seriesWinner = "opponent";
          else seriesWinner = "draw";

          const dbWinner = seriesWinner === "draw" ? "draw" : abRole(seriesWinner);
          await RandomChallengeRoomModel.setWinner(roomCode, dbWinner);

          nsp.to(roomCode).emit("series-over", {
            seriesWinner,
            roundWinner: finalRoundWinner,
            roundNumber: state.currentRound,
            seriesLength: state.seriesLength,
            creatorScore: state.creatorScore,
            opponentScore: state.opponentScore,
            answer: state.answer,
            fullName: state.fullName,
            creatorName: room.player_a_name,
            opponentName: room.player_b_name,
            creatorBoard,
            opponentBoard,
            aliasWord,
          });

          cleanupRoom(roomCode);
        } else {
          const roundAnswer = state.answer;
          const roundFullName = state.fullName;
          const completedRound = state.currentRound;

          await RandomChallengeRoomModel.setBetweenRounds(roomCode);
          resetRoundState(state);
          state.currentRound = completedRound + 1;

          nsp.to(roomCode).emit("round-over", {
            roundWinner: finalRoundWinner,
            roundNumber: completedRound,
            seriesLength: state.seriesLength,
            creatorScore: state.creatorScore,
            opponentScore: state.opponentScore,
            answer: roundAnswer,
            fullName: roundFullName,
            creatorName: room.player_a_name,
            opponentName: room.player_b_name,
            creatorBoard,
            opponentBoard,
            aliasWord,
          });
        }
      }
    }
  }
}

function initRandomSocket(io) {
  const nsp = io.of("/random");

  nsp.on("connection", (socket) => {
    let currentRoom = null;
    let currentRole = null; // "creator" | "opponent" (UI role)

    // ─── Matchmaking queue ───────────────────────────────────────────────
    socket.on("enter-queue", async (data) => {
      try {
        const { playerName, deviceId, userId } = data || {};
        const result = await matchmaker.enterQueue({
          socket,
          playerName,
          deviceId,
          userId,
        });

        if (result.error) {
          return socket.emit("room-error", { message: result.error });
        }

        if (!result.matched) {
          socket.emit("queued", {
            position: result.position,
            queueSize: matchmaker.getQueueSize(),
          });
          return;
        }

        // Paired — notify both sides with their UI role
        const youRole = clientRole(result.you.role);
        const oppRole = clientRole(result.opponent.role);

        result.you.socket.emit("match-found", {
          roomCode: result.roomCode,
          yourRole: youRole,
          opponentName: result.you.opponentName,
          playerName: result.you.playerName,
        });
        result.opponent.socket.emit("match-found", {
          roomCode: result.roomCode,
          yourRole: oppRole,
          opponentName: result.opponent.opponentName,
          playerName: result.opponent.playerName,
        });
      } catch (err) {
        console.error("enter-queue error:", err);
        socket.emit("room-error", { message: "Failed to enter queue" });
      }
    });

    socket.on("leave-queue", () => {
      try {
        matchmaker.leaveQueue(socket.id);
        socket.emit("queue-left");
      } catch (err) {
        console.error("leave-queue error:", err);
      }
    });

    // ─── Game room (mirrors challenge-socket.js join-room) ───────────────
    socket.on("join-room", async (data) => {
      try {
        const { roomCode, playerName } = data || {};
        if (!roomCode || !playerName) {
          return socket.emit("room-error", { message: "Room code and player name are required" });
        }

        const trimmedName = playerName.trim().slice(0, 50);
        const nameLower = trimmedName.toLowerCase();

        const room = await RandomChallengeRoomModel.findByCode(roomCode);
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
        state.creatorScore = room.player_a_score || 0;
        state.opponentScore = room.player_b_score || 0;
        state.isBotMatch = !!room.is_bot_match;
        state.botPersona = room.bot_persona || null;

        const isAByName = room.player_a_name.toLowerCase() === nameLower;
        const isBByName = room.player_b_name && room.player_b_name.toLowerCase() === nameLower;
        const aOnline = state.creator && state.creator.connected;

        let role = null; // "creator" | "opponent"

        if (isAByName && !aOnline) {
          role = "creator";
          state.creator = socket;
        } else if (isBByName && !state.isBotMatch) {
          if (state.opponent && state.opponent.id !== socket.id && state.opponent.connected) {
            return socket.emit("room-error", { message: "Opponent is already connected" });
          }
          role = "opponent";
          state.opponent = socket;
        } else {
          return socket.emit("room-error", { message: "Room is full" });
        }

        if (state.isBotMatch && role === "creator" && state.humanUserId == null) {
          state.humanUserId = room.player_a_user_id || null;
          state.humanIsOldPlayer = await isOldHumanPlayer(state.humanUserId);
        }

        currentRole = role;
        currentRoom = roomCode;
        socket.join(roomCode);

        // Reconnection mid-round
        if ((room.status === "active" || room.status === "between_rounds") && state.gameStarted && state.answer) {
          const encoded = xorEncode(state.answer, ENCODE_KEY);
          const encodedFullName = xorEncode(state.fullName, ENCODE_KEY);

          const rounds = await RandomChallengeRoundModel.findByRoomId(room.id);
          const currentRoundDb = rounds.find((r) => r.round_number === state.currentRound);
          let hints = currentRoundDb?.hints || [];
          if (typeof hints === "string") {
            try { hints = JSON.parse(hints); } catch { hints = []; }
          }

          const otherName = role === "creator" ? (room.player_b_name || "") : room.player_a_name;

          let previousGuesses = [];
          let opponentGuessesSoFar = 0;
          if (state.roundDbId) {
            const myGuesses = await RandomChallengeGuessModel.findByRoundAndRole(state.roundDbId, abRole(role));
            previousGuesses = myGuesses.map((g) => ({
              guess: g.guess,
              statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
              isCorrect: !!g.is_correct,
            }));
            const oppRole = role === "creator" ? "opponent" : "creator";
            const opponentRows = await RandomChallengeGuessModel.findByRoundAndRole(state.roundDbId, abRole(oppRole));
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
          const otherName = role === "creator" ? (room.player_b_name || "") : room.player_a_name;
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

        // Waiting room → start round 1 once human (and human opponent, when not a bot) are present
        const startReady = state.creator && (state.opponent || state.isBotMatch) && !state.gameStarted;
        if (startReady) {
          await RandomChallengeRoomModel.startGame(roomCode);

          const deviceId = (data.deviceId || "").slice(0, 64);
          if (deviceId) {
            const uid = role === "creator" ? (room.player_a_user_id || null) : (room.player_b_user_id || null);
            UserActivityModel.upsert(deviceId, uid, "random_match").catch(() => {});
          }

          const ok = await startNewRound(nsp, roomCode, state);
          if (!ok) return;
          return;
        }

        socket.emit("waiting", {
          roomCode,
          creatorName: room.player_a_name,
          yourRole: role,
        });

        const otherSocket = role === "creator" ? state.opponent : state.creator;
        if (otherSocket) {
          otherSocket.emit("player-joined", { opponentName: trimmedName });
        }
      } catch (err) {
        console.error("[random] join-room error:", err);
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

        const room = await RandomChallengeRoomModel.findByCode(roomCode);
        if (!room) {
          return socket.emit("room-error", { message: "Room not found" });
        }

        // Record human guess timestamp for bot pacing before the await chain
        // so a fast bot reschedule sees up-to-date data.
        state.humanGuessTimes.push(Date.now());

        await applyGuess({ nsp, roomCode, room, state, role, guess: guessLower, isBot: false });

        // Reschedule bot to keep its pace tied to the human's average.
        if (state.isBotMatch && state.gameStarted
            && !state.creatorFinished && !state.opponentFinished) {
          scheduleNextBotGuess(nsp, roomCode);
        }
      } catch (err) {
        console.error("[random] submit-guess error:", err);
        socket.emit("room-error", { message: "Failed to process guess" });
      }
    });

    socket.on("propose-series", async (data) => {
      try {
        const { roomCode, seriesLength } = data || {};
        if (!roomCode || !currentRole) return;
        if (seriesLength !== 3 && seriesLength !== 5) return;

        const state = roomSockets.get(roomCode);
        if (!state) return;
        if (state.isBotMatch) {
          return socket.emit("room-error", { message: "Series are not available against bots" });
        }
        if (state.seriesLength > 1) return;
        if (!state.roundOneWinner) return;

        state.pendingProposal = { seriesLength, proposerRole: currentRole };
        state.declinedRoles = null;

        const room = await RandomChallengeRoomModel.findByCode(roomCode);
        const proposerName = currentRole === "creator" ? room.player_a_name : room.player_b_name;

        const otherSocket = currentRole === "creator" ? state.opponent : state.creator;
        if (otherSocket) {
          otherSocket.emit("series-proposed", { seriesLength, proposerName });
        }

        socket.emit("proposal-sent", { seriesLength });
      } catch (err) {
        console.error("[random] propose-series error:", err);
      }
    });

    socket.on("accept-series", async (data) => {
      try {
        const { roomCode } = data || {};
        if (!roomCode || !currentRole) return;

        const state = roomSockets.get(roomCode);
        if (!state || !state.pendingProposal) return;
        if (state.isBotMatch) {
          state.pendingProposal = null;
          return socket.emit("room-error", { message: "Series are not available against bots" });
        }

        const { seriesLength } = state.pendingProposal;
        state.seriesLength = seriesLength;
        state.pendingProposal = null;

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

        await RandomChallengeRoomModel.setSeriesLength(roomCode, seriesLength);
        if (state.creatorScore > 0) await RandomChallengeRoomModel.updateScore(roomCode, "player_a");
        if (state.opponentScore > 0) await RandomChallengeRoomModel.updateScore(roomCode, "player_b");

        resetRoundState(state);
        state.currentRound = 2;

        nsp.to(roomCode).emit("series-accepted", {
          seriesLength,
          creatorScore: state.creatorScore,
          opponentScore: state.opponentScore,
          currentRound: 2,
        });
      } catch (err) {
        console.error("[random] accept-series error:", err);
        socket.emit("room-error", { message: "Failed to accept series" });
      }
    });

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
        console.error("[random] decline-series error:", err);
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
          await RandomChallengeRoomModel.advanceRound(roomCode);
          const ok = await startNewRound(nsp, roomCode, state);
          if (!ok) return;
        }
      } catch (err) {
        console.error("[random] ready-next-round error:", err);
        socket.emit("room-error", { message: "Failed to start next round" });
      }
    });

    socket.on("disconnect", async () => {
      // Always clear from queue on any disconnect
      matchmaker.cleanupOnDisconnect(socket.id);

      if (!currentRoom) return;

      const state = roomSockets.get(currentRoom);
      if (!state) return;

      const role = currentRole;
      const roomCode = currentRoom;

      if (role === "creator") state.creator = null;
      else if (role === "opponent") state.opponent = null;

      const otherSocket = role === "creator" ? state.opponent : state.creator;
      if (otherSocket) {
        otherSocket.emit("opponent-disconnected", { role });
      }

      if (!state.gameStarted && state.currentRound === 1 && !state.roundOneWinner && role === "creator") {
        try {
          const room = await RandomChallengeRoomModel.findByCode(roomCode);
          if (room && room.status === "waiting") {
            await RandomChallengeRoomModel.expireOldRooms(0);
          }
        } catch { /* non-critical */ }
        cleanupRoom(roomCode);
        return;
      }

      if (!state.creator && !state.opponent) {
        cleanupRoom(roomCode);
        return;
      }

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

module.exports = { initRandomSocket };
