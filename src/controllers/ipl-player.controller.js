const iplPlayerService = require("../services/ipl-player.service");

async function getAllPlayers(req, res) {
  try {
    const players = await iplPlayerService.getAllPlayers();
    res.json({ success: true, data: players });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPlayerByName(req, res) {
  try {
    const player = await iplPlayerService.getPlayerByName(req.params.name);
    res.json({ success: true, data: player });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPlayerById(req, res) {
  try {
    const player = await iplPlayerService.getPlayerById(req.params.id);
    res.json({ success: true, data: player });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getTodayPuzzle(req, res) {
  try {
    const puzzle = await iplPlayerService.getTodayPuzzle();
    res.json({ success: true, data: puzzle });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPuzzleByDay(req, res) {
  try {
    const puzzle = await iplPlayerService.getPuzzleByDay(parseInt(req.params.day, 10));
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
    const result = await iplPlayerService.setDailyPuzzle(player_name);
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
    const result = await iplPlayerService.seedPlayers(players);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function autoSetDailyPuzzle(req, res) {
  try {
    const result = await iplPlayerService.autoSetDailyPuzzle();
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
