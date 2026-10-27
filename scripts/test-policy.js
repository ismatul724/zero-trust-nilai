const assert = require("node:assert/strict");
const { authorize } = require("../gateway/policy");

async function login(username, deviceId) {
  const response = await fetch(
    "http://127.0.0.1:3000/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        username,
        password: "Praktikum123!",
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  const data = await response.json();

  assert.equal(response.status, 200, `Login ${username} gagal`);
  return data.access_token;
}

function check(
  label,
  token,
  device,
  method,
  path,
  time,
  expectedStatus
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Device-ID": device,
  };

  const req = {
    method,
    path,
    get(name) {
      return headers[name];
    },
  };

  const result = authorize(req, new Date(time));

  console.log(
    `${label}: ${result.status} | ${result.reason}`
  );

  assert.equal(result.status, expectedStatus, label);
}

async function main() {
  const dosen = await login("dosen1", "device-dosen1");
  const mahasiswa = await login("mhs1", "device-mhs1");
  const admin = await login("admin", "device-admin");

  const daytime = "2026-10-27T10:00:00+07:00";
  const nighttime = "2026-10-27T22:00:00+07:00";

  check(
    "Dosen mengubah kelas sendiri",
    dosen, "device-dosen1", "PUT", "/nilai/1",
    daytime, 200
  );

  check(
    "Dosen mengubah kelas dosen lain",
    dosen, "device-dosen1", "PUT", "/nilai/3",
    daytime, 403
  );

  check(
    "Dosen mengubah nilai malam hari",
    dosen, "device-dosen1", "PUT", "/nilai/1",
    nighttime, 403
  );

  check(
    "Device asing",
    dosen, "device-asing", "GET", "/nilai",
    daytime, 403
  );

  check(
    "Mahasiswa melihat transkrip sendiri",
    mahasiswa, "device-mhs1", "GET",
    "/transkrip/247006111001", daytime, 200
  );

  check(
    "Mahasiswa melihat transkrip orang lain",
    mahasiswa, "device-mhs1", "GET",
    "/transkrip/247006111002", daytime, 403
  );

  check(
    "Admin melihat transkrip mahasiswa",
    admin, "device-admin", "GET",
    "/transkrip/247006111002", daytime, 200
  );

  check(
    "Admin mencoba sinkronisasi",
    admin, "device-admin", "POST",
    "/transkrip/sinkron", daytime, 403
  );

  console.log("");
  console.log("LULUS: 8 pengujian keputusan policy.");
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});