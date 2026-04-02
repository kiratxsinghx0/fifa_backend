const crypto = require("crypto");
const IplPlayerModel = require("../models/ipl-player.model");
const IplDailyPuzzleModel = require("../models/ipl-daily-puzzle.model");

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
  const player = await IplPlayerModel.findByName(name);
  if (!player) {
    throw Object.assign(new Error(`IPL Player "${name}" not found`), { status: 404 });
  }
  return player;
}

async function getPlayerById(id) {
  const player = await IplPlayerModel.findById(id);
  if (!player) {
    throw Object.assign(new Error(`IPL Player with id ${id} not found`), { status: 404 });
  }
  return player;
}

async function getTodayPuzzle() {
  const puzzle = await IplDailyPuzzleModel.findToday();
  if (!puzzle) {
    const latest = await IplDailyPuzzleModel.findLatest();
    if (!latest) {
      const result = await autoSetDailyPuzzle();
      const { alreadySet, ...puzzleData } = result;
      return puzzleData;
    }
    return formatPuzzleResponse(latest);
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

async function setDailyPuzzle(playerName) {
  const name = playerName.toUpperCase();

  const player = await IplPlayerModel.findByName(name);
  if (!player) {
    throw Object.assign(new Error(`IPL Player "${name}" not found in DB`), { status: 400 });
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
    set_at: new Date(),
  };

  await IplDailyPuzzleModel.create(puzzle);

  return formatPuzzleResponse(puzzle);
}

function formatPuzzleResponse(puzzle) {
  return {
    day: puzzle.day,
    encoded: puzzle.encoded,
    hash: puzzle.hash,
    previousHash: puzzle.previous_hash,
    setAt: puzzle.set_at,
  };
}

function extractHintsFromRow(row) {
  const teams = typeof row.teams === "string" ? JSON.parse(row.teams) : row.teams;
  const rawTrivias = typeof row.trivias === "string" ? JSON.parse(row.trivias) : row.trivias;
  const trivias = rawTrivias.flat();

  return [
    { age: row.age },
    { country: row.country },
    { iplTeam: row.ipl_team },
    { role: row.role },
    { teams },
    { batting: row.batting },
    { bowling: row.bowling },
    { jersey: row.jersey },
    { nickname: row.nickname },
    { era: row.era },
    { popularity: row.popularity },
    { openingHint: row.opening_hint },
    { trivia: trivias },
  ];
}

async function seedPlayers(playerList) {
  const mapped = playerList.map((p) => {
    const hints = p.hints || [];
    const findHint = (key) => {
      const entry = hints.find((h) => h[key] !== undefined);
      return entry ? entry[key] : null;
    };
    const triviaEntry = hints.find((h) => h.trivia !== undefined);
    const trivias = triviaEntry
      ? Array.isArray(triviaEntry.trivia) ? triviaEntry.trivia : [triviaEntry.trivia]
      : [];

    return {
      name: p.name,
      full_name: p.meta?.fullName || null,
      is_shortened: p.meta?.shortened || false,
      age: findHint("age") || 0,
      country: findHint("country") || "",
      ipl_team: findHint("iplTeam") || "",
      role: findHint("role") || "",
      teams: findHint("teams") || [],
      batting: findHint("batting") || "N/A",
      bowling: findHint("bowling") || "N/A",
      jersey: findHint("jersey") ?? null,
      nickname: findHint("nickname") || null,
      era: findHint("era") || "current",
      popularity: findHint("popularity") || "regular",
      opening_hint: findHint("openingHint") || "",
      trivias,
    };
  });
  await IplPlayerModel.bulkCreate(mapped);
  return { inserted: mapped.length };
}

async function autoSetDailyPuzzle() {
  const existing = await IplDailyPuzzleModel.findToday();
  if (existing) {
    return { alreadySet: true, ...formatPuzzleResponse(existing) };
  }

  const latest = await IplDailyPuzzleModel.findLatest();
  const excludeId = latest?.player_id ?? null;

  const player = await IplPlayerModel.findRandomExcluding(excludeId);
  if (!player) {
    throw Object.assign(new Error("No eligible IPL players found in DB"), { status: 500 });
  }

  const puzzle = {
    day: latest ? latest.day + 1 : 1,
    player_id: player.id,
    encoded: xorEncode(player.name.toLowerCase(), ENCODE_KEY),
    hash: sha256(player.name.toLowerCase()),
    previous_hash: latest?.hash ?? null,
    set_at: new Date(),
  };

  await IplDailyPuzzleModel.create(puzzle);

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
  extractHintsFromRow,
};
