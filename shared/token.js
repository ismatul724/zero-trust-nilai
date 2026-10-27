const jwt = require("jsonwebtoken");
const config = require("./config");

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ["HS256"],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
}

module.exports = {
  verifyToken,
};