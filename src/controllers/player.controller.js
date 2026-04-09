const playerService = require("../services/player.service");

async function getAllPlayers(req, res) {
  try {
    const players = await playerService.getAllPlayers();
    res.json({ success: true, data: players });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPlayerByName(req, res) {
  try {
    const player = await playerService.getPlayerByName(req.params.name);
    res.json({ success: true, data: player });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPlayerById(req, res) {
  try {
    const player = await playerService.getPlayerById(req.params.id);
    res.json({ success: true, data: player });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getTodayPuzzle(req, res) {
  try {
    const puzzle = await playerService.getTodayPuzzle();
    res.json({ success: true, data: puzzle });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPuzzleByDay(req, res) {
  try {
    const day = parseInt(req.params.day, 10);
    if (isNaN(day) || day < 1) {
      return res.status(400).json({ success: false, message: "Invalid day parameter" });
    }
    const puzzle = await playerService.getPuzzleByDay(day);
    res.json({ success: true, data: puzzle });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function setDailyPuzzle(req, res) {
  try {
    const { player_name } = req.body;
    if (!player_name || typeof player_name !== "string") {
      return res.status(400).json({ success: false, message: "player_name is required" });
    }
    const result = await playerService.setDailyPuzzle(player_name);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function seedPlayers(req, res) {
  try {
    const { players } = req.body;
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ success: false, message: "players array is required" });
    }
    const result = await playerService.seedPlayers(players);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function autoSetDailyPuzzle(req, res) {
  try {
    const result = await playerService.autoSetDailyPuzzle();
    const status = result.alreadySet ? 200 : 201;
    res.status(status).json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getAllPlayers,
  getPlayerByName,
  getPlayerById,
  getTodayPuzzle,
  getPuzzleByDay,
  setDailyPuzzle,
  seedPlayers,
  autoSetDailyPuzzle,
};
