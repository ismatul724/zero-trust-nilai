const assert = require("node:assert/strict");

const baseUrl = "http://127.0.0.1:3000";

async function post(endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-ID": "device-dosen1",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();

  console.log(`POST ${endpoint} -> HTTP ${response.status}`);
  console.log("Pesan:", data.message);
  console.log("");

  return {
    status: response.status,
    data,
  };
}

async function main() {
  console.log("=== 1. LOGIN ===");

  const login = await post("/auth/login", {
    username: "dosen1",
    password: "Praktikum123!",
  });

  assert.equal(login.status, 200, "Login harus berhasil.");

  const refreshToken = login.data.refresh_token;

  assert.equal(
    typeof refreshToken,
    "string",
    "Respons login harus memuat refresh token."
  );

  assert.match(
    refreshToken,
    /^[a-f0-9]{96}$/,
    "Refresh token dari login harus memiliki format yang sesuai."
  );

  console.log("Format refresh token sesuai; nilainya tidak ditampilkan.");
  console.log("");

  console.log("=== 2. REFRESH SEBELUM LOGOUT ===");

  const refresh = await post("/auth/refresh", {
    refresh_token: refreshToken,
  });

  assert.equal(
    refresh.status,
    200,
    "Refresh sebelum logout harus berhasil."
  );

  assert.equal(
    typeof refresh.data.access_token,
    "string",
    "Refresh harus menghasilkan access token."
  );

  console.log("=== 3. LOGOUT ===");

  const logout = await post("/auth/logout", {
    refresh_token: refreshToken,
  });

  assert.equal(logout.status, 200, "Logout harus berhasil.");

  console.log("=== 4. REFRESH SETELAH LOGOUT ===");

  const afterLogout = await post("/auth/refresh", {
    refresh_token: refreshToken,
  });

  assert.equal(
    afterLogout.status,
    401,
    "Refresh token yang dicabut harus ditolak."
  );

  assert.equal(
    afterLogout.data.message,
    "Refresh token tidak valid, kedaluwarsa, atau sudah dicabut.",
    "Token harus ditolak karena status sesi, bukan format token."
  );

  console.log("LULUS: login, refresh, logout, dan pencabutan token.");
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});