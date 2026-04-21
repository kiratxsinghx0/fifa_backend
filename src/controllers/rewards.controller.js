const WeeklyWinnersModel = require("../models/weekly-winners.model");
const RewardClaimModel = require("../models/reward-claim.model");
const UserGameResultModel = require("../models/user-game-result.model");

async function snapshotWeeklyWinners() {
  const rows = await UserGameResultModel.getLastWeekLeaderboard();
  const top5 = rows.slice(0, 5);
  if (top5.length === 0) return { weekNumber: null, count: 0 };

  const currentMax = await WeeklyWinnersModel.getLatestWeekNumber();
  const weekNumber = currentMax + 1;

  await WeeklyWinnersModel.insertWinners(weekNumber, top5);
  return { weekNumber, count: top5.length };
}

async function getEligibility(req, res) {
  try {
    const userId = req.userId;
    const lastWeekRank = await UserGameResultModel.getLastWeekRankForUser(userId);

    const weekNumber = await WeeklyWinnersModel.getLatestWeekNumber();
    if (weekNumber === 0) {
      return res.json({
        success: true,
        data: {
          eligible: false,
          rank: null,
          last_week_rank: lastWeekRank,
          week_number: 0,
          already_claimed: false,
          claim_status: null,
        },
      });
    }

    const entry = await WeeklyWinnersModel.findUserInWeek(userId, weekNumber);
    if (!entry) {
      return res.json({
        success: true,
        data: {
          eligible: false,
          rank: null,
          last_week_rank: lastWeekRank,
          week_number: weekNumber,
          already_claimed: false,
          claim_status: null,
        },
      });
    }

    const amount = RewardClaimModel.REWARD_AMOUNTS[entry.rank];
    const existing = await RewardClaimModel.findByUserAndWeek(userId, weekNumber);

    res.json({
      success: true,
      data: {
        eligible: true,
        rank: entry.rank,
        last_week_rank: lastWeekRank,
        amount,
        week_number: weekNumber,
        already_claimed: !!existing,
        claim_status: existing ? existing.status : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function claimReward(req, res) {
  try {
    const userId = req.userId;
    const { instagram_username, reddit_username, upi_id } = req.body;

    if (!instagram_username || !reddit_username || !upi_id) {
      return res.status(400).json({
        success: false,
        message: "Instagram username, Reddit username, and UPI ID are all required",
      });
    }

    const weekNumber = await WeeklyWinnersModel.getLatestWeekNumber();
    if (weekNumber === 0) {
      return res.status(400).json({ success: false, message: "No weekly winners available yet" });
    }

    const entry = await WeeklyWinnersModel.findUserInWeek(userId, weekNumber);
    if (!entry) {
      return res.status(403).json({ success: false, message: "You are not in the top 5 for this week" });
    }

    const existing = await RewardClaimModel.findByUserAndWeek(userId, weekNumber);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You have already claimed your reward for this week",
        data: { status: existing.status, amount: existing.amount },
      });
    }

    const result = await RewardClaimModel.create({
      user_id: userId,
      week_number: weekNumber,
      rank: entry.rank,
      instagram_username: instagram_username.trim(),
      reddit_username: reddit_username.trim(),
      upi_id: upi_id.trim(),
    });

    res.json({
      success: true,
      message: `Reward of ₹${result.amount} claimed! We'll verify and send within 48 hours.`,
      data: { id: result.id, rank: entry.rank, amount: result.amount, status: "pending" },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Already claimed for this week" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getClaimStatus(req, res) {
  try {
    const userId = req.userId;
    const weekNumber = parseInt(req.query.week_number, 10) || await WeeklyWinnersModel.getLatestWeekNumber();

    const claim = await RewardClaimModel.findByUserAndWeek(userId, weekNumber);
    if (!claim) {
      return res.json({ success: true, data: { claimed: false } });
    }

    res.json({
      success: true,
      data: {
        claimed: true,
        status: claim.status,
        rank: claim.rank,
        amount: claim.amount,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWeeklyWinners(req, res) {
  try {
    const weekNumber = parseInt(req.query.week_number, 10) || await WeeklyWinnersModel.getLatestWeekNumber();
    if (weekNumber === 0) {
      return res.json({ success: true, data: { week_number: 0, winners: [] } });
    }

    const winners = await WeeklyWinnersModel.getByWeek(weekNumber);
    const masked = winners.map((w) => ({
      rank: w.rank,
      email: w.email.split("@")[0],
      games_won: w.games_won,
      points: w.points,
    }));

    res.json({ success: true, data: { week_number: weekNumber, winners: masked } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// --- Admin endpoints ---

async function adminGetPending(_req, res) {
  try {
    const claims = await RewardClaimModel.getPending();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function adminUpdateStatus(req, res) {
  try {
    const { id, status, notes } = req.body;
    if (!id || !["verified", "paid", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "id and valid status required" });
    }
    await RewardClaimModel.updateStatus(id, status, notes);
    res.json({ success: true, message: `Claim ${id} updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function adminTriggerSnapshot(_req, res) {
  try {
    const result = await snapshotWeeklyWinners();
    if (result.weekNumber === null) {
      return res.json({ success: true, message: "No winners found for last week" });
    }
    res.json({
      success: true,
      message: `Week ${result.weekNumber} snapshot created with ${result.count} winners`,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Snapshot already exists for this week" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  snapshotWeeklyWinners,
  getEligibility,
  claimReward,
  getClaimStatus,
  getWeeklyWinners,
  adminGetPending,
  adminUpdateStatus,
  adminTriggerSnapshot,
};
