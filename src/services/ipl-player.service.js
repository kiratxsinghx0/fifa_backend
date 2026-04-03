const crypto = require("crypto");
const IplPlayerModel = require("../models/ipl-player.model");
const IplDailyPuzzleModel = require("../models/ipl-daily-puzzle.model");
const ScheduleIplPuzzleModel = require("../models/schedule-ipl-puzzle.model");

const ENCODE_KEY = "fw26k";
const WORD_LENGTH = 5;

function xorEncode(text, key) {
  const buf = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    buf[i] = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
  }
  return buf.toString("base64");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function getAllPlayers() {
  return IplPlayerModel.findAll();
}

async function getPlayerByName(name) {
  const rows = await IplPlayerModel.findByName(name);
  if (!rows.length) {
    throw Object.assign(new Error(`IPL Player "${name}" not found`), { status: 404 });
  }
  return rows;
}

async function getPlayerById(id) {
  const player = await IplPlayerModel.findById(id);
  if (!player) {
    throw Object.assign(new Error(`IPL Player with id ${id} not found`), { status: 404 });
  }
  return player;
}

async function getTodayPuzzle() {
  const puzzle = await IplDailyPuzzleModel.findLatest();
  if (!puzzle) {
    throw Object.assign(new Error("No IPL puzzle available yet"), { status: 404 });
  }
  return formatPuzzleResponse(puzzle);
}

async function getPuzzleByDay(day) {
  const puzzle = await IplDailyPuzzleModel.findByDay(day);
  if (!puzzle) {
    throw Object.assign(new Error(`No IPL puzzle found for day ${day}`), { status: 404 });
  }
  return formatPuzzleResponse(puzzle);
}

/**
 * Set a daily puzzle.
 * @param {string} playerName - 5-letter answer token (e.g. "VIRAT")
 * @param {string} fullName   - canonical player name to disambiguate shared tokens
 * @param {Array}  hints      - hint data array for the puzzle
 */
async function setDailyPuzzle(playerName, fullName, hints) {
  const name = playerName.toUpperCase();

  const player = await IplPlayerModel.findByNameAndPlayer(name, fullName);
  if (!player) {
    throw Object.assign(
      new Error(`IPL Player token "${name}" for "${fullName}" not found in DB`),
      { status: 400 }
    );
  }

  if (player.name.length !== WORD_LENGTH) {
    throw Object.assign(
      new Error(`"${player.name}" is ${player.name.length} letters — must be exactly ${WORD_LENGTH}`),
      { status: 400 }
    );
  }

  const latest = await IplDailyPuzzleModel.findLatest();

  const newHash = sha256(player.name.toLowerCase());
  if (latest && latest.hash === newHash) {
    throw Object.assign(
      new Error(`"${player.name}" is already the current puzzle. Pick a different player.`),
      { status: 409 }
    );
  }

  const puzzle = {
    day: latest ? latest.day + 1 : 1,
    player_id: player.id,
    encoded: xorEncode(player.name.toLowerCase(), ENCODE_KEY),
    hash: newHash,
    previous_hash: latest?.hash ?? null,
    full_name: player.full_name,
    is_shortened: player.is_shortened,
    hints: hints || null,
    set_at: new Date(),
  };

  await IplDailyPuzzleModel.create(puzzle);

  return formatPuzzleResponse(puzzle);
}

function formatPuzzleResponse(puzzle) {
  let hints = puzzle.hints ?? null;
  if (typeof hints === "string") {
    try { hints = JSON.parse(hints); } catch { hints = null; }
  }
  return {
    day: puzzle.day,
    encoded: puzzle.encoded,
    hash: puzzle.hash,
    previousHash: puzzle.previous_hash,
    fullName: puzzle.full_name || null,
    isShortened: Boolean(puzzle.is_shortened),
    hints,
    setAt: puzzle.set_at,
  };
}

/**
 * Seed player tokens into the registry (for autocomplete / validation).
 * Each entry is one name-token for a player; a player typically has two.
 */
async function seedPlayers(playerList) {
  const mapped = playerList.map((p) => ({
    name: p.name,
    full_name: p.meta?.fullName || p.name,
    is_shortened: p.meta?.shortened || false,
  }));
  await IplPlayerModel.bulkCreate(mapped);
  return { inserted: mapped.length };
}

async function autoSetDailyPuzzle() {
  const existing = await IplDailyPuzzleModel.findToday();
  if (existing) {
    return { alreadySet: true, ...formatPuzzleResponse(existing) };
  }

  const latest = await IplDailyPuzzleModel.findLatest();

  const scheduled = await ScheduleIplPuzzleModel.findNextUnused();

  let token;
  let hints = null;

  if (scheduled) {
    token = await IplPlayerModel.findByNameAndPlayer(
      scheduled.player_name,
      scheduled.full_name
    );
    if (token) {
      hints = scheduled.hints ?? null;
      if (typeof hints === "string") {
        try { hints = JSON.parse(hints); } catch { hints = null; }
      }
      await ScheduleIplPuzzleModel.markUsed(scheduled.id);
    } else {
      console.warn(
        `[autoSet] Scheduled player "${scheduled.player_name}" / "${scheduled.full_name}" not found in ipl_players — skipping to random`
      );
      await ScheduleIplPuzzleModel.markUsed(scheduled.id);
    }
  }

  if (!token) {
    const excludeFullName = latest?.full_name ?? null;
    token = await IplPlayerModel.findRandomExcluding(excludeFullName);
  }

  if (!token) {
    throw Object.assign(new Error("No eligible IPL players found in DB"), { status: 500 });
  }

  const puzzle = {
    day: latest ? latest.day + 1 : 1,
    player_id: token.id,
    encoded: xorEncode(token.name.toLowerCase(), ENCODE_KEY),
    hash: sha256(token.name.toLowerCase()),
    previous_hash: latest?.hash ?? null,
    full_name: token.full_name,
    is_shortened: token.is_shortened,
    hints,
    set_at: new Date(),
  };

  await IplDailyPuzzleModel.create(puzzle);

  return { fromSchedule: !!scheduled && !!token, ...formatPuzzleResponse(puzzle) };
}

async function getPlayerCount() {
  return IplPlayerModel.getCount();
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
};
