const crypto = require("crypto");
const PlayerModel = require("../models/player.model");
const DailyPuzzleModel = require("../models/daily-puzzle.model");

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
  return PlayerModel.findAll();
}

async function getPlayerByName(name) {
  const player = await PlayerModel.findByName(name);
  if (!player) {
    throw Object.assign(new Error(`Player "${name}" not found`), { status: 404 });
  }
  return player;
}

async function getPlayerById(id) {
  const player = await PlayerModel.findById(id);
  if (!player) {
    throw Object.assign(new Error(`Player with id ${id} not found`), { status: 404 });
  }
  return player;
}

async function getTodayPuzzle() {
  const puzzle = await DailyPuzzleModel.findToday();
  if (!puzzle) {
    const latest = await DailyPuzzleModel.findLatest();
    if (!latest) {
      throw Object.assign(new Error("No puzzle has been set yet"), { status: 404 });
    }
    return formatPuzzleResponse(latest);
  }
  return formatPuzzleResponse(puzzle);
}

async function getPuzzleByDay(day) {
  const puzzle = await DailyPuzzleModel.findByDay(day);
  if (!puzzle) {
    throw Object.assign(new Error(`No puzzle found for day ${day}`), { status: 404 });
  }
  return formatPuzzleResponse(puzzle);
}

async function setDailyPuzzle(playerName) {
  const name = playerName.toUpperCase();

  const player = await PlayerModel.findByName(name);
  if (!player) {
    throw Object.assign(new Error(`Player "${name}" not found in DB`), { status: 400 });
  }

  if (player.name.length !== WORD_LENGTH) {
    throw Object.assign(
      new Error(`"${player.name}" is ${player.name.length} letters — must be exactly ${WORD_LENGTH}`),
      { status: 400 }
    );
  }

  const latest = await DailyPuzzleModel.findLatest();

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
    set_at: new Date(),
  };

  await DailyPuzzleModel.create(puzzle);

  return formatPuzzleResponse(puzzle);
}

function formatPuzzleResponse(puzzle) {
  return {
    day: puzzle.day,
    encoded: puzzle.encoded,
    hash: puzzle.hash,
    previousHash: puzzle.previous_hash,
  };
}

async function seedPlayers(playerList) {
  const mapped = playerList.map((p) => ({
    name: p.name,
    full_name: p.meta?.fullName || null,
    is_shortened: p.meta?.shortened || false,
    age: p.hint.age,
    club: p.hint.club,
    country: p.hint.country,
    position: p.hint.position,
    trivia: p.hint.trivia,
  }));
  await PlayerModel.bulkCreate(mapped);
  return { inserted: mapped.length };
}

async function autoSetDailyPuzzle() {
  const existing = await DailyPuzzleModel.findToday();
  if (existing) {
    return { alreadySet: true, ...formatPuzzleResponse(existing) };
  }

  const latest = await DailyPuzzleModel.findLatest();
  const excludeId = latest?.player_id ?? null;

  const player = await PlayerModel.findRandomExcluding(excludeId);
  if (!player) {
    throw Object.assign(new Error("No eligible players found in DB"), { status: 500 });
  }

  const puzzle = {
    day: latest ? latest.day + 1 : 1,
    player_id: player.id,
    encoded: xorEncode(player.name.toLowerCase(), ENCODE_KEY),
    hash: sha256(player.name.toLowerCase()),
    previous_hash: latest?.hash ?? null,
    set_at: new Date(),
  };

  await DailyPuzzleModel.create(puzzle);

  return formatPuzzleResponse(puzzle);
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
