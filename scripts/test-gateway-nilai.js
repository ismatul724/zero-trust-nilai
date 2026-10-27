const assert = require("node:assert/strict");
const config = require("../shared/config");

const gateway = "http://127.0.0.1:3000";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();

  return {
    status: response.status,
    data,
  };
}

async function login(username, device) {
  const result = await request(`${gateway}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-ID": device,
    },
    body: JSON.stringify({
      username,
      password: "Praktikum123!",
    }),
  });

  assert.equal(result.status, 200, `Login ${username} gagal`);

  return result.data.access_token;
}

async function getGrades(token, device) {
  return request(`${gateway}/nilai`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Device-ID": device,
    },
  });
}

async function main() {
  const mahasiswa = await login("mhs1", "device-mhs1");
  const dosen = await login("dosen1", "device-dosen1");
  const admin = await login("admin", "device-admin");

  const studentResult = await getGrades(
    mahasiswa,
    "device-mhs1"
  );

  assert.equal(studentResult.status, 200);
  assert.ok(studentResult.data.data.length > 0);
  assert.ok(
    studentResult.data.data.every(
      (row) => row.nim === "247006111001"
    )
  );

  console.log("LULUS: mahasiswa hanya menerima nilai sendiri.");

  const lecturerResult = await getGrades(
    dosen,
    "device-dosen1"
  );

  assert.equal(lecturerResult.status, 200);
  assert.ok(lecturerResult.data.data.length > 0);
  assert.ok(
    lecturerResult.data.data.every(
      (row) => row.class_id === 1
    )
  );

  console.log("LULUS: dosen hanya menerima nilai kelas sendiri.");

  const adminResult = await getGrades(admin, "device-admin");
  assert.equal(adminResult.status, 403);

  console.log("LULUS: admin ditolak pada GET /nilai.");

  const wrongDevice = await getGrades(dosen, "device-asing");
  assert.equal(wrongDevice.status, 403);

  console.log("LULUS: device asing ditolak gateway.");

  const noToken = await request(`${gateway}/nilai`, {
    headers: {
      "X-Device-ID": "device-dosen1",
    },
  });

  assert.equal(noToken.status, 401);

  console.log("LULUS: request tanpa token ditolak gateway.");

  const direct = await request(
    "http://127.0.0.1:3001/nilai"
  );

  assert.equal(direct.status, 403);

  console.log("LULUS: akses langsung tanpa gateway secret ditolak.");

  const invalidToken = await request(
    "http://127.0.0.1:3001/nilai",
    {
      headers: {
        "X-Gateway-Secret": config.gatewaySecret,
        Authorization: "Bearer token-palsu",
      },
    }
  );

  assert.equal(invalidToken.status, 401);

  console.log(
    "LULUS: gateway secret benar tetap ditolak jika token tidak valid."
  );

  console.log("");
  console.log("LULUS: 7 pengujian integrasi gateway dan Service Nilai.");
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});