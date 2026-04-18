const crypto = require("crypto");

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const ENCODE_KEY = "fw26k";

function getLetterStatuses(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const answerArr = answer.split("");
  const guessArr = guess.split("");
  const used = Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === answerArr[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessArr[i] === answerArr[j]) {
        result[i] = "present";
        used[j] = true;
        break;
      }
    }
  }
  return result;
}

function countStatuses(statuses) {
  let correct = 0;
  let present = 0;
  for (const s of statuses) {
    if (s === "correct") correct++;
    else if (s === "present") present++;
  }
  return { correct, present };
}

function xorEncode(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result, "binary").toString("base64");
}

function xorDecode(encoded, key) {
  const raw = Buffer.from(encoded, "base64").toString("binary");
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    result += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

module.exports = {
  WORD_LENGTH,
  MAX_GUESSES,
  ENCODE_KEY,
  getLetterStatuses,
  countStatuses,
  xorEncode,
  xorDecode,
  generateRoomCode,
};
