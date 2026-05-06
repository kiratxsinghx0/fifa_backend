/**
 * Bot persona generator for fallback random matches.
 * 20 first names × 20 last names — picked independently each time.
 */

const FIRST_NAMES = [
  "Aarav", "Vihaan", "Kabir", "Reyansh", "Aditya",
  "Arjun", "Krishna", "Ishaan", "Dev", "Rudra",
  "Aanya", "Kiara", "Myra", "Anaya", "Saanvi",
  "Diya", "Ritika", "Kavya", "Meher", "Tanvi",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Yadav", "Malhotra", "Bajaj",
  "Chauhan", "Bansal", "Saxena", "Kapoor", "Tiwari",
  "Reddy", "Naidu", "Pillai", "Menon", "Iyer",
  "Shetty", "Patnaik", "Gowda", "Chatterjee", "Bora",
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomBotDisplayName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

module.exports = {
  FIRST_NAMES,
  LAST_NAMES,
  randomBotDisplayName,
};
