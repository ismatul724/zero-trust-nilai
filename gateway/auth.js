const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const db = require("../shared/database");
const config = require("../shared/config");
const audit = require("./audit");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = req.get("X-Device-ID");

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password
  ) {
    audit(req, "anonymous", "deny", "Data login tidak lengkap");

    return res.status(400).json({
      message: "Username dan password wajib diisi.",
    });
  }

  if (!deviceId) {
    audit(req, "anonymous", "deny", "Header device tidak ada");

    return res.status(403).json({
      message: "Header X-Device-ID wajib diisi.",
    });
  }

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE username = ? AND active = 1
  `).get(username.trim());

  const validPassword = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!user || !validPassword) {
    audit(req, "anonymous", "deny", "Kredensial tidak valid");

    return res.status(401).json({
      message: "Username atau password salah.",
    });
  }

  const device = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ?
      AND device_id = ?
      AND active = 1
  `).get(user.id, deviceId);

  if (!device) {
    audit(
      req,
      `user:${user.id}`,
      "deny",
      "Device tidak terdaftar untuk user"
    );

    return res.status(403).json({
      message: "Device tidak terdaftar untuk akun ini.",
    });
  }

  const accessToken = jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      token_type: "access",
      device_id: deviceId,
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: "10m",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }
  );

  const refreshToken = crypto.randomBytes(48).toString("hex");

  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const now = Date.now();

  db.prepare(`
    INSERT INTO refresh_tokens
      (
        user_id,
        device_id,
        token_hash,
        expires_at,
        created_at
      )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    user.id,
    deviceId,
    refreshTokenHash,
    now + 24 * 60 * 60 * 1000,
    now
  );

  audit(
    req,
    `user:${user.id}`,
    "allow",
    "Kredensial valid dan device terdaftar"
  );

  res.set("Cache-Control", "no-store");

  return res.json({
    message: "Login berhasil.",
    token_type: "Bearer",
    access_token: accessToken,
    expires_in: 600,
    refresh_token: refreshToken,
    refresh_expires_in: 86400,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      nim: user.nim,
    },
  });
});

function validateRefreshToken(req, res, next) {
  const refreshToken = req.body?.refresh_token;
  const deviceId = req.get("X-Device-ID");

  if (
    typeof refreshToken !== "string" ||
    !/^[a-f0-9]{96}$/.test(refreshToken)
  ) {
    audit(req, "anonymous", "deny", "Format refresh token tidak valid");

    return res.status(401).json({
      message: "Refresh token tidak valid.",
    });
  }

  if (!deviceId) {
    audit(req, "anonymous", "deny", "Header device tidak ada");

    return res.status(403).json({
      message: "Header X-Device-ID wajib diisi.",
    });
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const session = db.prepare(`
    SELECT
      rt.id AS token_id,
      rt.user_id,
      rt.device_id,
      rt.expires_at,
      rt.revoked_at,
      u.role,
      u.active AS user_active
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
  `).get(tokenHash);

  if (
    !session ||
    session.revoked_at !== null ||
    session.expires_at <= Date.now() ||
    session.user_active !== 1
  ) {
    audit(
      req,
      "anonymous",
      "deny",
      "Refresh token tidak valid, kedaluwarsa, atau dicabut"
    );

    return res.status(401).json({
      message: "Refresh token tidak valid, kedaluwarsa, atau sudah dicabut.",
    });
  }

  const device = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ?
      AND device_id = ?
      AND active = 1
  `).get(session.user_id, deviceId);

  if (session.device_id !== deviceId || !device) {
    audit(
      req,
      `user:${session.user_id}`,
      "deny",
      "Device tidak sesuai dengan sesi refresh token"
    );

    return res.status(403).json({
      message: "Device tidak sesuai atau tidak terdaftar.",
    });
  }

  req.refreshSession = session;
  next();
}

router.post("/refresh", validateRefreshToken, (req, res) => {
  const session = req.refreshSession;

  const accessToken = jwt.sign(
    {
      sub: String(session.user_id),
      role: session.role,
      token_type: "access",
      device_id: session.device_id,
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: "10m",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }
  );

  audit(
    req,
    `user:${session.user_id}`,
    "allow",
    "Access token diterbitkan dari refresh token valid"
  );

  res.set("Cache-Control", "no-store");

  return res.json({
    message: "Access token berhasil diperbarui.",
    token_type: "Bearer",
    access_token: accessToken,
    expires_in: 600,
  });
});

router.post("/logout", validateRefreshToken, (req, res) => {
  const session = req.refreshSession;

  const result = db.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(Date.now(), session.token_id);

  if (result.changes !== 1) {
    audit(
      req,
      `user:${session.user_id}`,
      "deny",
      "Sesi tidak dapat dicabut"
    );

    return res.status(401).json({
      message: "Sesi tidak valid.",
    });
  }

  audit(
    req,
    `user:${session.user_id}`,
    "allow",
    "Logout berhasil dan refresh token dicabut"
  );

  res.set("Cache-Control", "no-store");

  return res.json({
    message: "Logout berhasil. Refresh token telah dicabut.",
  });
});

function secretMatches(received, expected) {
  const receivedHash = crypto
    .createHash("sha256")
    .update(received)
    .digest();

  const expectedHash = crypto
    .createHash("sha256")
    .update(expected)
    .digest();

  return crypto.timingSafeEqual(receivedHash, expectedHash);
}

router.post("/service", (req, res) => {
  const { client_id, client_secret } = req.body || {};

  if (
    typeof client_id !== "string" ||
    typeof client_secret !== "string" ||
    !client_id ||
    !client_secret
  ) {
    audit(
      req,
      "anonymous",
      "deny",
      "Kredensial service tidak lengkap"
    );

    return res.status(400).json({
      message: "Client ID dan client secret wajib diisi.",
    });
  }

  const validSecret = secretMatches(
    client_secret,
    config.serviceClientSecret
  );

  if (client_id !== config.serviceClientId || !validSecret) {
    audit(
      req,
      "anonymous",
      "deny",
      "Kredensial service tidak valid"
    );

    return res.status(401).json({
      message: "Kredensial service tidak valid.",
    });
  }

  const serviceToken = jwt.sign(
    {
      sub: config.serviceClientId,
      role: "service",
      token_type: "service",
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: "5m",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }
  );

  audit(
    req,
    `service:${config.serviceClientId}`,
    "allow",
    "Token service diterbitkan untuk Service Nilai"
  );

  res.set("Cache-Control", "no-store");

  return res.json({
    message: "Token service berhasil diterbitkan.",
    token_type: "Bearer",
    access_token: serviceToken,
    expires_in: 300,
  });
});

module.exports = router;
