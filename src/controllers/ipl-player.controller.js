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
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const puzzle = await iplPlayerService.getTodayPuzzle();
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
    const puzzle = await iplPlayerService.getPuzzleByDay(day);
    res.json({ success: true, data: puzzle });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function setDailyPuzzle(req, res) {
  try {
    const { player_name, full_name, hints, fun_fact } = req.body;
    if (!player_name || typeof player_name !== "string") {
      return res.status(400).json({ success: false, message: "player_name is required (5-letter answer token)" });
    }
    if (!full_name || typeof full_name !== "string") {
      return res.status(400).json({ success: false, message: "full_name is required to identify the player" });
    }
    if (!hints || !Array.isArray(hints)) {
      return res.status(400).json({ success: false, message: "hints array is required" });
    }
    const result = await iplPlayerService.setDailyPuzzle(player_name, full_name, hints, fun_fact);
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

async function getPlayerCount(req, res) {
  try {
    const count = await iplPlayerService.getPlayerCount();
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getHardModeTodayPuzzle(req, res) {
  try {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const puzzle = await iplPlayerService.getHardModeTodayPuzzle();
    res.json({ success: true, data: puzzle });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function autoSetHardModeDailyPuzzle(req, res) {
  try {
    const result = await iplPlayerService.autoSetHardModeDailyPuzzle();
    const status = result.alreadySet ? 200 : 201;
    res.status(status).json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function setHardModeDailyPuzzle(req, res) {
  try {
    const { player_name, full_name } = req.body;
    if (!player_name || typeof player_name !== "string") {
      return res.status(400).json({ success: false, message: "player_name is required (5-letter answer token)" });
    }
    if (!full_name || typeof full_name !== "string") {
      return res.status(400).json({ success: false, message: "full_name is required to identify the player" });
    }
    const result = await iplPlayerService.setHardModeDailyPuzzle(player_name, full_name);
    res.status(201).json({ success: true, data: result });
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
  getPlayerCount,
  getHardModeTodayPuzzle,
  autoSetHardModeDailyPuzzle,
  setHardModeDailyPuzzle,
};
