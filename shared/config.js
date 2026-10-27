const path = require("node:path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});

const jwtSecret = process.env.JWT_SECRET;
const serviceClientId = process.env.SERVICE_CLIENT_ID;
const serviceClientSecret = process.env.SERVICE_CLIENT_SECRET;
const gatewaySecret = process.env.GATEWAY_SECRET;

if (!jwtSecret || jwtSecret.length < 64) {
  throw new Error("JWT_SECRET belum diisi dengan benar.");
}

if (
  !serviceClientId ||
  !serviceClientSecret ||
  serviceClientSecret.length < 64
) {
  throw new Error("Kredensial service belum diisi dengan benar.");
}

if (!gatewaySecret || gatewaySecret.length < 64) {
  throw new Error("GATEWAY_SECRET belum diisi dengan benar.");
}

module.exports = {
  gatewayPort: Number(process.env.GATEWAY_PORT || 3000),
  jwtSecret,
  jwtIssuer: "zero-trust-gateway",
  jwtAudience: "sistem-nilai",
  serviceClientId,
  serviceClientSecret,
  gatewaySecret,
};