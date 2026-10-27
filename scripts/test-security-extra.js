const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const config = require("../shared/config");

const gateway = "http://127.0.0.1:3000";

async function request(url, method, headers, body) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });

  return {
    status: response.status,
    data: await response.json(),
  };
}

async function main() {
  const login = await request(
    `${gateway}/auth/login`,
    "POST",
    { "X-Device-ID": "device-dosen2" },
    {
      username: "dosen2",
      password: "Praktikum123!",
    }
  );

  assert.equal(login.status, 200, "Login dosen2 gagal.");

  const headers = {
    Authorization: `Bearer ${login.data.access_token}`,
    "X-Device-ID": "device-dosen2",
  };

  const before = await request(
    `${gateway}/nilai`,
    "GET",
    headers
  );

  assert.equal(before.status, 200);

  const grade = before.data.data.find((row) => row.id === 4);

  assert.ok(grade, "Nilai ID 4 tidak ditemukan.");
  assert.equal(
    grade.finalized,
    0,
    "Kelas 2 sudah final; pengujian ini membutuhkan kelas belum final."
  );

  const originalScore = grade.score;
  const testScore = originalScore === 91 ? 92 : 91;
  let changed = false;

  try {
    const update = await request(
      `${gateway}/nilai/4`,
      "PUT",
      headers,
      { score: testScore }
    );

    assert.equal(
      update.status,
      200,
      `Perubahan ditolak: ${update.data.message}`
    );

    changed = true;

    const after = await request(
      `${gateway}/nilai`,
      "GET",
      headers
    );

    assert.equal(after.status, 200);
    assert.equal(
      after.data.data.find((row) => row.id === 4).score,
      testScore
    );

    console.log(
      "LULUS: dosen dapat mengubah nilai kelas sendiri sebelum final."
    );

    const invalidScore = await request(
      `${gateway}/nilai/4`,
      "PUT",
      headers,
      { score: -1 }
    );

    assert.equal(invalidScore.status, 400);

    console.log("LULUS: score di luar 0-100 ditolak.");
  } finally {
    if (changed) {
      const restore = await request(
        `${gateway}/nilai/4`,
        "PUT",
        headers,
        { score: originalScore }
      );

      assert.equal(
        restore.status,
        200,
        "Nilai awal gagal dipulihkan. Periksa nilai ID 4."
      );

      console.log("Nilai awal berhasil dipulihkan.");
    }
  }

  const expiredAccess = jwt.sign(
    {
      sub: "3",
      role: "dosen",
      token_type: "access",
      device_id: "device-dosen2",
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: -60,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }
  );

  const expiredAtGateway = await request(
    `${gateway}/nilai`,
    "GET",
    {
      Authorization: `Bearer ${expiredAccess}`,
      "X-Device-ID": "device-dosen2",
    }
  );

  assert.equal(expiredAtGateway.status, 401);

  console.log("LULUS: access token kedaluwarsa ditolak gateway.");

  for (const port of [3001, 3002]) {
    const path = port === 3001
      ? "/nilai"
      : "/transkrip/247006111003";

    const expiredAtService = await request(
      `http://127.0.0.1:${port}${path}`,
      "GET",
      {
        "X-Gateway-Secret": config.gatewaySecret,
        Authorization: `Bearer ${expiredAccess}`,
      }
    );

    assert.equal(expiredAtService.status, 401);

    console.log(
      `LULUS: service port ${port} menolak access token kedaluwarsa.`
    );

    const missingToken = await request(
      `http://127.0.0.1:${port}${path}`,
      "GET",
      {
        "X-Gateway-Secret": config.gatewaySecret,
      }
    );

    assert.equal(missingToken.status, 401);

    console.log(
      `LULUS: service port ${port} menolak request tanpa token.`
    );
  }

  const expiredService = jwt.sign(
    {
      sub: config.serviceClientId,
      role: "service",
      token_type: "service",
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: -60,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }
  );

  const serviceHeaders = {
    Authorization: `Bearer ${expiredService}`,
  };

  const expiredServiceAtGateway = await request(
    `${gateway}/transkrip/sinkron`,
    "POST",
    serviceHeaders,
    { class_id: 1 }
  );

  assert.equal(expiredServiceAtGateway.status, 401);

  console.log("LULUS: token service kedaluwarsa ditolak gateway.");

  const expiredServiceAtResource = await request(
    "http://127.0.0.1:3002/transkrip/sinkron",
    "POST",
    {
      ...serviceHeaders,
      "X-Gateway-Secret": config.gatewaySecret,
    },
    { class_id: 1 }
  );

  assert.equal(expiredServiceAtResource.status, 401);

  console.log(
    "LULUS: token service kedaluwarsa ditolak Service Transkrip."
  );

  console.log("");
  console.log("LULUS: pengujian keamanan tambahan.");
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});