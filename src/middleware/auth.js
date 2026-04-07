const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "stumpd_default_secret_change_me";
const JWT_EXPIRES_IN = "30d";

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  try {
    const decoded = verifyToken(header.slice(7));
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

function authOptional(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const decoded = verifyToken(header.slice(7));
      req.userId = decoded.userId;
    } catch {
      req.userId = null;
    }
  } else {
    req.userId = null;
  }
  next();
}

module.exports = { signToken, verifyToken, authRequired, authOptional, JWT_SECRET };
