const RandomChallengeRoomModel = require("../models/random-challenge-room.model");
const RandomMatchmakingQueueModel = require("../models/random-matchmaking-queue.model");
const { generateRoomCode } = require("../utils/game-logic");
const { randomBotDisplayName } = require("./random-bot-persona");

/**
 * In-memory FIFO matchmaking queue for random matches.
 * Single-process only; horizontal scaling will need Redis.
 *
 * Entry shape:
 *   { socket, socketId, playerName, deviceId, userId, joinedAtMs, auditId,
 *     botTimer }
 */
const queue = [];

const BOT_FALLBACK_MIN_MS = 35_000;
const BOT_FALLBACK_MAX_MS = 45_000;

function indexOfSocketId(socketId) {
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].socketId === socketId) return i;
  }
  return -1;
}

function getQueueSize() {
  return queue.length;
}

async function generateUniqueRoomCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateRoomCode();
    const existing = await RandomChallengeRoomModel.findByCode(code);
    if (!existing) return code;
  }
  return generateRoomCode();
}

function clearBotTimer(entry) {
  if (entry?.botTimer) {
    clearTimeout(entry.botTimer);
    entry.botTimer = null;
  }
}

/**
 * Schedule a bot fallback ~40s after a player has been waiting alone.
 * If they pair with a human, leave the queue, or disconnect first,
 * the timer is cleared instead.
 */
function scheduleBotFallback(entry) {
  clearBotTimer(entry);
  const delay = BOT_FALLBACK_MIN_MS + Math.random() * (BOT_FALLBACK_MAX_MS - BOT_FALLBACK_MIN_MS);
  entry.botTimer = setTimeout(() => {
    entry.botTimer = null;
    fireBotFallback(entry).catch((err) =>
      console.error("[matchmaker] bot fallback error:", err)
    );
  }, delay);
}

async function fireBotFallback(entry) {
  const idx = indexOfSocketId(entry.socketId);
  if (idx === -1) return;
  if (!entry.socket || entry.socket.disconnected) {
    queue.splice(idx, 1);
    if (entry.auditId) {
      RandomMatchmakingQueueModel
        .markLeft(entry.auditId, Date.now() - entry.joinedAtMs)
        .catch(() => {});
    }
    return;
  }

  queue.splice(idx, 1);

  const roomCode = await generateUniqueRoomCode();
  const botName = randomBotDisplayName();

  await RandomChallengeRoomModel.create({
    room_code: roomCode,
    player_a_user_id: entry.userId,
    player_a_name: entry.playerName,
    player_b_user_id: null,
    player_b_name: botName,
    is_bot_match: 1,
    bot_persona: botName,
  });

  if (entry.auditId) {
    RandomMatchmakingQueueModel
      .markMatched(entry.auditId, roomCode, Date.now() - entry.joinedAtMs)
      .catch(() => {});
  }

  entry.socket.emit("match-found", {
    roomCode,
    yourRole: "creator",
    opponentName: botName,
    playerName: entry.playerName,
  });
}

/**
 * Add a player to the queue. If a partner is already waiting, pair them.
 * Returns one of:
 *   { matched: false, position }                     — waiting in queue
 *   { matched: true, roomCode, you, opponent }       — paired immediately
 *   { error: string }                                — invalid input
 */
async function enterQueue({ socket, playerName, deviceId, userId }) {
  const trimmedName = (playerName || "").trim().slice(0, 50);
  if (!trimmedName) {
    return { error: "playerName is required" };
  }

  if (indexOfSocketId(socket.id) !== -1) {
    return { matched: false, position: indexOfSocketId(socket.id) + 1 };
  }

  let auditId = null;
  try {
    const r = await RandomMatchmakingQueueModel.create({
      user_id: userId || null,
      display_name: trimmedName,
      device_id: deviceId || null,
      socket_id: socket.id,
    });
    auditId = r.insertId || null;
  } catch (err) {
    console.error("matchmaking queue audit insert failed:", err.message);
  }

  const newEntry = {
    socket,
    socketId: socket.id,
    playerName: trimmedName,
    deviceId: deviceId || null,
    userId: userId || null,
    joinedAtMs: Date.now(),
    auditId,
    botTimer: null,
  };

  if (queue.length === 0) {
    queue.push(newEntry);
    scheduleBotFallback(newEntry);
    return { matched: false, position: queue.length };
  }

  // Pair with the head of the queue
  const partner = queue.shift();
  clearBotTimer(partner);
  if (!partner.socket || partner.socket.disconnected) {
    if (partner.auditId) {
      RandomMatchmakingQueueModel
        .markLeft(partner.auditId, Date.now() - partner.joinedAtMs)
        .catch(() => {});
    }
    return enterQueue({ socket, playerName, deviceId, userId });
  }

  const roomCode = await generateUniqueRoomCode();

  await RandomChallengeRoomModel.create({
    room_code: roomCode,
    player_a_user_id: partner.userId,
    player_a_name: partner.playerName,
    player_b_user_id: newEntry.userId,
    player_b_name: newEntry.playerName,
    is_bot_match: 0,
    bot_persona: null,
  });

  if (partner.auditId) {
    RandomMatchmakingQueueModel
      .markMatched(partner.auditId, roomCode, Date.now() - partner.joinedAtMs)
      .catch(() => {});
  }
  if (auditId) {
    RandomMatchmakingQueueModel
      .markMatched(auditId, roomCode, Date.now() - newEntry.joinedAtMs)
      .catch(() => {});
  }

  return {
    matched: true,
    roomCode,
    you: { role: "player_b", playerName: newEntry.playerName, opponentName: partner.playerName, socket },
    opponent: { role: "player_a", playerName: partner.playerName, opponentName: newEntry.playerName, socket: partner.socket },
  };
}

/**
 * Remove a player from the queue (idempotent).
 * Returns true if removed, false if not in queue.
 */
function leaveQueue(socketId) {
  const idx = indexOfSocketId(socketId);
  if (idx === -1) return false;

  const [entry] = queue.splice(idx, 1);
  clearBotTimer(entry);
  if (entry?.auditId) {
    RandomMatchmakingQueueModel
      .markLeft(entry.auditId, Date.now() - entry.joinedAtMs)
      .catch(() => {});
  }
  return true;
}

function cleanupOnDisconnect(socketId) {
  return leaveQueue(socketId);
}

module.exports = {
  enterQueue,
  leaveQueue,
  cleanupOnDisconnect,
  getQueueSize,
};
