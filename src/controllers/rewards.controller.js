const WeeklyWinnersModel = require("../models/weekly-winners.model");
const RewardClaimModel = require("../models/reward-claim.model");
const UserGameResultModel = require("../models/user-game-result.model");

/** Ranks 1–10 in the weekly snapshot can submit a reward claim. */
const REWARD_CLAIM_MAX_RANK = 10;

/** User may PATCH claim details while admin has not finalized payment/rejection. */
const CLAIM_EDITABLE_STATUSES = ["pending", "verified"];

function parseYesNo(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

function rowBool(v) {
  if (v === true || v === 1) return true;
  if (Buffer.isBuffer(v) && v.length === 1) return v[0] === 1;
  return false;
}

function claimPayloadFromRow(claim) {
  if (!claim) return null;
  return {
    instagram_username: claim.instagram_username,
    reddit_username: claim.reddit_username,
    upi_id: claim.upi_id,
    insta_follow_done: rowBool(claim.insta_follow_done),
    reddit_follow_done: rowBool(claim.reddit_follow_done),
    insta_story_done: rowBool(claim.insta_story_done),
    reddit_post_done: rowBool(claim.reddit_post_done),
  };
}

async function snapshotWeeklyWinners() {
  const rows = await UserGameResultModel.getLastWeekLeaderboard(10);
  const top10 = rows.slice(0, 10);
  if (top10.length === 0) return { weekNumber: null, count: 0 };

  const currentMax = await WeeklyWinnersModel.getLatestWeekNumber();
  const weekNumber = currentMax + 1;

  await WeeklyWinnersModel.insertWinners(weekNumber, top10);
  return { weekNumber, count: top10.length };
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
          claim: null,
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
          claim: null,
        },
      });
    }

    const inClaimableTier = entry.rank <= REWARD_CLAIM_MAX_RANK;
    const amount = inClaimableTier ? RewardClaimModel.REWARD_AMOUNTS[entry.rank] : null;
    const existing = await RewardClaimModel.findByUserAndWeek(userId, weekNumber);

    res.json({
      success: true,
      data: {
        /** In top-10 snapshot tier (can use claim page / see success). */
        eligible: inClaimableTier,
        rank: entry.rank,
        last_week_rank: lastWeekRank,
        amount,
        week_number: weekNumber,
        already_claimed: !!existing,
        claim_status: existing ? existing.status : null,
        claim: claimPayloadFromRow(existing),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function claimReward(req, res) {
  try {
    const userId = req.userId;
    const {
      instagram_username,
      reddit_username,
      upi_id,
      insta_follow_done,
      reddit_follow_done,
      insta_story_done,
      reddit_post_done,
    } = req.body;

    if (!instagram_username || !reddit_username || !upi_id) {
      return res.status(400).json({
        success: false,
        message: "Instagram username, Reddit username, and UPI ID are all required",
      });
    }

    const igFollow = parseYesNo(insta_follow_done);
    const redditFollow = parseYesNo(reddit_follow_done);
    const igStory = parseYesNo(insta_story_done);
    const redditPost = parseYesNo(reddit_post_done);
    if (igFollow === null || redditFollow === null || igStory === null || redditPost === null) {
      return res.status(400).json({
        success: false,
        message: "Each checklist item (Instagram follow, Reddit follow, Instagram story, Reddit post) must be yes (true/1) or no (false/0)",
      });
    }

    const weekNumber = await WeeklyWinnersModel.getLatestWeekNumber();
    if (weekNumber === 0) {
      return res.status(400).json({ success: false, message: "No weekly winners available yet" });
    }

    const entry = await WeeklyWinnersModel.findUserInWeek(userId, weekNumber);
    if (!entry) {
      return res.status(403).json({ success: false, message: "You are not in the top 10 for this week" });
    }

    if (entry.rank > REWARD_CLAIM_MAX_RANK) {
      return res.status(403).json({
        success: false,
        message: "You are not in the top 10 for this week",
      });
    }

    const ig = instagram_username.trim();
    const reddit = reddit_username.trim();
    const upi = upi_id.trim();
    const checklist = {
      insta_follow_done: igFollow,
      reddit_follow_done: redditFollow,
      insta_story_done: igStory,
      reddit_post_done: redditPost,
    };

    const existing = await RewardClaimModel.findByUserAndWeek(userId, weekNumber);
    if (existing) {
      if (!CLAIM_EDITABLE_STATUSES.includes(existing.status)) {
        return res.status(403).json({
          success: false,
          message: "This claim can no longer be edited (paid or rejected).",
          data: { status: existing.status, amount: existing.amount },
        });
      }
      await RewardClaimModel.updateByUserAndWeek(userId, weekNumber, {
        instagram_username: ig,
        reddit_username: reddit,
        upi_id: upi,
        ...checklist,
      });
      return res.json({
        success: true,
        message: "Claim updated.",
        data: {
          id: existing.id,
          rank: entry.rank,
          amount: existing.amount,
          status: existing.status,
          updated: true,
          ...checklist,
        },
      });
    }

    const result = await RewardClaimModel.create({
      user_id: userId,
      week_number: weekNumber,
      rank: entry.rank,
      instagram_username: ig,
      reddit_username: reddit,
      upi_id: upi,
      ...checklist,
    });

    res.json({
      success: true,
      message: `Reward of ₹${result.amount} claimed! We'll verify and send within 48 hours.`,
      data: {
        id: result.id,
        rank: entry.rank,
        amount: result.amount,
        status: "pending",
        updated: false,
        ...checklist,
      },
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
        claim: claimPayloadFromRow(claim),
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
