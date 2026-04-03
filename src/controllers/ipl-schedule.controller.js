const ScheduleIplPuzzleModel = require("../models/schedule-ipl-puzzle.model");

async function getAll(req, res) {
  try {
    const rows = await ScheduleIplPuzzleModel.findAll();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getQueue(req, res) {
  try {
    const rows = await ScheduleIplPuzzleModel.findAllUnused();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addSchedule(req, res) {
  try {
    const { player_name, full_name, hints } = req.body;
    if (!player_name || typeof player_name !== "string") {
      return res.status(400).json({ success: false, message: "player_name is required (5-letter token)" });
    }
    if (!full_name || typeof full_name !== "string") {
      return res.status(400).json({ success: false, message: "full_name is required" });
    }
    await ScheduleIplPuzzleModel.create({ player_name, full_name, hints: hints || null });
    res.status(201).json({ success: true, message: "Scheduled puzzle added" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function bulkAddSchedule(req, res) {
  try {
    const { puzzles } = req.body;
    if (!Array.isArray(puzzles) || puzzles.length === 0) {
      return res.status(400).json({ success: false, message: "puzzles array is required" });
    }
    for (const p of puzzles) {
      if (!p.player_name || !p.full_name) {
        return res.status(400).json({
          success: false,
          message: "Each entry needs player_name and full_name",
        });
      }
    }
    await ScheduleIplPuzzleModel.bulkCreate(puzzles);
    res.status(201).json({ success: true, message: `${puzzles.length} scheduled puzzles added` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, getQueue, addSchedule, bulkAddSchedule };
