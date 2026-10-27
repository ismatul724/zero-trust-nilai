const crypto = require("node:crypto");
const config = require("./config");
const { verifyToken } = require("./token");

function secretMatches(received, expected) {
  const first = crypto
    .createHash("sha256")
    .update(received)
    .digest();

  const second = crypto
    .createHash("sha256")
    .update(expected)
    .digest();

  return crypto.timingSafeEqual(first, second);
}

function verifyServiceRequest(req, res, next) {
  const gatewaySecret = req.get("X-Gateway-Secret");

  if (
    !gatewaySecret ||
    !secretMatches(gatewaySecret, config.gatewaySecret)
  ) {
    return res.status(403).json({
      message: "Request harus melalui API Gateway.",
    });
  }

  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({
      message: "Bearer token wajib disertakan.",
    });
  }

  try {
    const claims = verifyToken(match.at(1));

    if (
      typeof claims !== "object" ||
      claims === null ||
      !Number.isFinite(claims.exp) ||
      !["access", "service"].includes(claims.token_type)
    ) {
      return res.status(401).json({
        message: "Payload token tidak valid.",
      });
    }

    req.auth = claims;
    next();
  } catch {
    return res.status(401).json({
      message: "Token tidak valid atau kedaluwarsa.",
    });
  }
}

module.exports = verifyServiceRequest;