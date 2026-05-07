/**
 * Bot persona generator for fallback random matches.
 * Single-name pool — picked uniformly at random each time using
 * crypto.randomInt for an unbiased selection (falls back to Math.random
 * if crypto is unavailable).
 */

const crypto = require("crypto");

const USERNAMES = [
  "CricFan", "IPLFan", "KohliFan", "MSDFan", "Hitman",
  "KingK", "Thala", "RohitFan", "RCBian", "CSKian",
  "MIFan", "KKRFan", "SRHFan", "PBKSFan", "DCFan",
  "CricAddict", "GullyBoy", "BatMan", "SixKing", "Bowler",
  "Spinner", "Yorker", "CricPro", "MatchGuy", "BleedBlue",
  "IndFan", "Stadium", "Memer", "SportsGuy", "HobbyMan",
  "GymBro", "Traveler", "Foodie", "NatureBoy", "Techie",
  "Gamer", "AnimeBoy", "MovieGuy", "NightBoy", "CoolGuy",
  "DesiBoy", "PunjabBoy", "VibeGuy", "FanBoy", "CricKid",
  "RunMachine", "CoverDrive", "FastGuy", "SpinGuy", "Captain",

  "KingVirat", "Viratian", "DhoniFan", "Rohitian", "BoomBoom",
  "SkyFan", "GillBoy", "HardikFan", "Jaddu", "YuviFan",
  "SachinFan", "DravidFan", "SehwagFan", "PantFan", "KLFan",
  "CricStar", "IPLKing", "MatchStar", "PowerHitter", "BattingPro",
  "SwingKing", "FastBowler", "OffSpinner", "Leggie", "KeeperBoy",
  "ThirdUmpire", "ScoreGuy", "CricWorld", "DesiFan", "BlueArmy",
  "IndiaBoy", "T20Fan", "ODIFan", "TestFan", "SuperOver",
  "BoundaryBoy", "SixMachine", "RunBoy", "WicketGuy", "CricVibes",

  "GymBoy", "LiftBro", "FitMan", "RunnerBoy", "FitVibes",
  "FoodLover", "TeaLover", "CoffeeBoy", "BurgerBoy", "PizzaFan",
  "TravelBoy", "HillBoy", "BeachGuy", "RoadTrip", "NatureFan",
  "MusicBoy", "SingerBoy", "BeatLover", "LoFiGuy", "DJBoy",
  "MovieFan", "ActionBoy", "AnimeKid", "MarvelFan", "DCBoy",
  "TechGuy", "CodeBoy", "DevMan", "AIKid", "CryptoBoy",
  "GamerBoy", "NoobPlayer", "ProPlayer", "SniperBoy", "RushGuy",

  "CoolMunda", "SherPuttar", "JattBoy", "PatialaBoy", "LassiBoy",
  "PunjabiMunda", "SwagBoy", "DesiMunda", "PindBoy", "Gabru",
  "VeerBoy", "SardarBoy", "UrbanBoy", "StreetBoy", "RoyalBoy",
  "KingBoy", "AlphaBoy", "SigmaBoy", "SilentBoy", "ViralBoy",

  "ThunderBoy", "StormGuy", "BlazeBoy", "FireGuy", "IceBoy",
  "DarkKnight", "NightKing", "WolfBoy", "LionHeart", "TigerBoy",
  "FalconBoy", "EagleEye", "HunterBoy", "GhostBoy", "ShadowBoy",
  "LegendBoy", "EpicGuy", "SavageBoy", "WildBoy", "MVPBoy",

  "LuckyBoy", "HappyGuy", "SmileBoy", "ChillGuy", "FunBoy",
  "CrazyBoy", "MadGuy", "SmartBoy", "BrainyBoy", "TopperBoy",
  "CollegeBoy", "HostelGuy", "CampusBoy", "BunkBoy", "ExamBoy",
  "OfficeBoy", "WorkMode", "StartupGuy", "BossBoy", "ManagerBoy",

  "PixelBoy", "CyberGuy", "FutureBoy", "NextGen", "UltraBoy",
  "NeonGuy", "TurboBoy", "RapidBoy", "RocketBoy", "JetBoy",
  "SpeedBoy", "FlashGuy", "VoltBoy", "DynamicBoy", "PrimeBoy",

  "ClassicBoy", "VintageGuy", "SimpleBoy", "RealBoy", "HonestBoy",
  "BraveBoy", "FearlessBoy", "DreamBoy", "HopeGuy", "WinnerBoy",
  "ChampionBoy", "HeroBoy", "MasterBoy", "EliteBoy", "RoyalKing",

  "KohliArmy", "DhoniArmy", "HitmanArmy", "RCBArmy", "CSKArmy",
  "MIArmy", "KKRArmy", "SRHArmy", "PBKSArmy", "DCArmy",
  "CricZone", "IPLZone", "FanZone", "SportsZone", "GameZone",
  "PlayBoy", "AllRounder", "Finisher", "OpenerBoy", "MiddleOrder",
  "PowerPlay", "DeathOvers", "RedBall", "WhiteBall", "CricShot",
];

function secureRandomIndex(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) return 0;
  try {
    if (typeof crypto.randomInt === "function") {
      return crypto.randomInt(0, maxExclusive);
    }
    // Rejection sampling using crypto.randomBytes for unbiased selection.
    const bytes = crypto.randomBytes(4);
    const value = bytes.readUInt32BE(0);
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    if (value < limit) return value % maxExclusive;
    return secureRandomIndex(maxExclusive);
  } catch {
    return Math.floor(Math.random() * maxExclusive);
  }
}

function pick(list) {
  return list[secureRandomIndex(list.length)];
}

function randomBotDisplayName() {
  return pick(USERNAMES);
}

module.exports = {
  USERNAMES,
  randomBotDisplayName,
};
