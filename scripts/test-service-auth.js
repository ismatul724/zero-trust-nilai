const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const config = require("../shared/config");

async function requestToken(clientSecret) {
  const response = await fetch(
    "http://127.0.0.1:3000/auth/service",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.serviceClientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  const data = await response.json();

  console.log("HTTP:", response.status);
  console.log("Pesan:", data.message);

  return {
    status: response.status,
    data,
  };
}

async function main() {
  console.log("=== 1. KREDENSIAL SERVICE BENAR ===");

  const valid = await requestToken(config.serviceClientSecret);

  assert.equal(valid.status, 200);

  const payload = jwt.verify(
    valid.data.access_token,
    config.jwtSecret,
    {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }
  );

  assert.equal(payload.sub, config.serviceClientId);
  assert.equal(payload.role, "service");
  assert.equal(payload.token_type, "service");
  assert.equal(payload.exp - payload.iat, 300);

  console.log("Subjek:", payload.sub);
  console.log("Role:", payload.role);
  console.log("Masa berlaku:", payload.exp - payload.iat, "detik");
  console.log("");

  console.log("=== 2. SECRET SERVICE SALAH ===");

  const invalid = await requestToken("secret-yang-salah");

  assert.equal(invalid.status, 401);

  console.log("");
  console.log(
    "LULUS: token service valid diterbitkan dan secret salah ditolak."
  );
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});