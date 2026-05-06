const RandomChallengeRoomModel = require("../models/random-challenge-room.model");
const RandomChallengeRoundModel = require("../models/random-challenge-round.model");
const RandomChallengeGuessModel = require("../models/random-challenge-guess.model");

function uiWinner(dbWinner) {
  if (!dbWinner) return null;
  if (dbWinner === "draw") return "draw";
  return dbWinner === "player_a" ? "creator" : "opponent";
}

async function getRoomInfo(req, res) {
  try {
    const { code } = req.params;
    const room = await RandomChallengeRoomModel.findByCode(code);
    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }

    res.json({
      success: true,
      data: {
        roomCode: room.room_code,
        status: room.status,
        creatorName: room.player_a_name,
        opponentName: room.player_b_name,
        isFull: !!room.player_b_name,
        winner: uiWinner(room.winner),
        seriesLength: room.series_length || 1,
        currentRound: room.current_round || 1,
        creatorScore: room.player_a_score || 0,
        opponentScore: room.player_b_score || 0,
        isBotMatch: !!room.is_bot_match,
        createdAt: room.created_at,
      },
    });
  } catch (err) {
    console.error("[random] getRoomInfo error:", err);
    res.status(500).json({ success: false, message: "Failed to get room info" });
  }
}

async function getRoomResult(req, res) {
  try {
    const { code } = req.params;
    const room = await RandomChallengeRoomModel.findByCode(code);
    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }
    if (room.status !== "completed") {
      return res.status(400).json({ success: false, message: "Game is not completed yet" });
    }

    const rounds = await RandomChallengeRoundModel.findByRoomId(room.id);
    const roundResults = [];

    for (const round of rounds) {
      const guesses = await RandomChallengeGuessModel.findByRound(round.id);
      roundResults.push({
        roundNumber: round.round_number,
        answer: round.player_name,
        fullName: round.full_name,
        winner: uiWinner(round.winner),
        creatorBoard: guesses
          .filter((g) => g.player_role === "player_a")
          .map((g) => ({
            guess: g.guess,
            statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
            isCorrect: !!g.is_correct,
          })),
        opponentBoard: guesses
          .filter((g) => g.player_role === "player_b")
          .map((g) => ({
            guess: g.guess,
            statuses: typeof g.letter_statuses === "string" ? JSON.parse(g.letter_statuses) : g.letter_statuses,
            isCorrect: !!g.is_correct,
          })),
      });
    }

    res.json({
      success: true,
      data: {
        roomCode: room.room_code,
        seriesWinner: uiWinner(room.winner),
        seriesLength: room.series_length || 1,
        creatorScore: room.player_a_score || 0,
        opponentScore: room.player_b_score || 0,
        creatorName: room.player_a_name,
        opponentName: room.player_b_name,
        rounds: roundResults,
      },
    });
  } catch (err) {
    console.error("[random] getRoomResult error:", err);
    res.status(500).json({ success: false, message: "Failed to get room result" });
  }
}

module.exports = {
  getRoomInfo,
  getRoomResult,
};
