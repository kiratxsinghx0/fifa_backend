const ChallengePlayerModel = require("../models/challenge-player.model");
const ChallengeRoomModel = require("../models/challenge-room.model");
const ChallengeGuessModel = require("../models/challenge-guess.model");
const { generateRoomCode } = require("../utils/game-logic");
const { verifyToken } = require("../middleware/auth");

function extractUserId(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  try {
    const decoded = verifyToken(header.slice(7));
    return decoded.userId;
  } catch {
    return null;
  }
}

async function createRoom(req, res) {
  try {
    const { playerName } = req.body;
    if (!playerName || typeof playerName !== "string" || playerName.trim().length === 0) {
      return res.status(400).json({ success: false, message: "playerName is required" });
    }

    const userId = extractUserId(req);
    let code;
    let attempts = 0;
    while (attempts < 10) {
      code = generateRoomCode();
      const existing = await ChallengeRoomModel.findByCode(code);
      if (!existing) break;
      attempts++;
    }

    await ChallengeRoomModel.create({
      room_code: code,
      creator_user_id: userId,
      creator_name: playerName.trim().slice(0, 50),
    });

    res.json({ success: true, data: { roomCode: code } });
  } catch (err) {
    console.error("createRoom error:", err);
    res.status(500).json({ success: false, message: "Failed to create room" });
  }
}

async function getRoomInfo(req, res) {
  try {
    const { code } = req.params;
    const room = await ChallengeRoomModel.findByCode(code);
    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }

    res.json({
      success: true,
      data: {
        roomCode: room.room_code,
        status: room.status,
        creatorName: room.creator_name,
        opponentName: room.opponent_name,
        isFull: !!room.opponent_name,
        winner: room.winner,
        createdAt: room.created_at,
      },
    });
  } catch (err) {
    console.error("getRoomInfo error:", err);
    res.status(500).json({ success: false, message: "Failed to get room info" });
  }
}

async function getRoomResult(req, res) {
  try {
    const { code } = req.params;
    const room = await ChallengeRoomModel.findByCode(code);
    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }
    if (room.status !== "completed") {
      return res.status(400).json({ success: false, message: "Game is not completed yet" });
    }

    const guesses = await ChallengeGuessModel.findByRoom(room.id);
    const creatorGuesses = guesses.filter((g) => g.player_role === "creator");
    const opponentGuesses = guesses.filter((g) => g.player_role === "opponent");

    res.json({
      success: true,
      data: {
        roomCode: room.room_code,
        winner: room.winner,
        answer: room.player_name,
        fullName: room.full_name,
        creatorName: room.creator_name,
        opponentName: room.opponent_name,
        creatorBoard: creatorGuesses.map((g) => ({
          guess: g.guess,
          statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
          isCorrect: !!g.is_correct,
        })),
        opponentBoard: opponentGuesses.map((g) => ({
          guess: g.guess,
          statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
          isCorrect: !!g.is_correct,
        })),
      },
    });
  } catch (err) {
    console.error("getRoomResult error:", err);
    res.status(500).json({ success: false, message: "Failed to get room result" });
  }
}

async function seedPlayers(req, res) {
  try {
    const { players } = req.body;
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ success: false, message: "players array is required" });
    }

    await ChallengePlayerModel.bulkCreate(players);
    const count = await ChallengePlayerModel.getCount();

    res.json({ success: true, data: { inserted: players.length, total: count } });
  } catch (err) {
    console.error("seedPlayers error:", err);
    res.status(500).json({ success: false, message: "Failed to seed players" });
  }
}

async function getPlayers(_req, res) {
  try {
    const players = await ChallengePlayerModel.findAll();
    res.json({ success: true, data: players });
  } catch (err) {
    console.error("getPlayers error:", err);
    res.status(500).json({ success: false, message: "Failed to get players" });
  }
}

module.exports = {
  createRoom,
  getRoomInfo,
  getRoomResult,
  seedPlayers,
  getPlayers,
};
