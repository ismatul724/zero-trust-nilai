const assert = require("node:assert/strict");
const config = require("../shared/config");

const gateway = "http://127.0.0.1:3000";

async function request(path, options = {}) {
  const response = await fetch(`${gateway}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });

  return {
    status: response.status,
    data: await response.json(),
  };
}

async function login(username, device) {
  const result = await request("/auth/login", {
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

function userHeaders(token, device) {
  return {
    Authorization: `Bearer ${token}`,
    "X-Device-ID": device,
  };
}

async function main() {
  const mahasiswa = await login("mhs1", "device-mhs1");
  const admin = await login("admin", "device-admin");
  const dosen = await login("dosen1", "device-dosen1");

  const own = await request("/transkrip/247006111001", {
    headers: userHeaders(mahasiswa, "device-mhs1"),
  });

  assert.equal(own.status, 200);
  assert.equal(own.data.mahasiswa.nim, "247006111001");
  assert.ok(Array.isArray(own.data.data));

  console.log("LULUS: mahasiswa melihat transkrip sendiri.");

  const other = await request("/transkrip/247006111002", {
    headers: userHeaders(mahasiswa, "device-mhs1"),
  });

  assert.equal(other.status, 403);

  console.log("LULUS: transkrip mahasiswa lain ditolak.");

  const adminRead = await request("/transkrip/247006111002", {
    headers: userHeaders(admin, "device-admin"),
  });

  assert.equal(adminRead.status, 200);
  assert.equal(adminRead.data.mahasiswa.nim, "247006111002");

  console.log("LULUS: admin melihat transkrip mahasiswa.");

  const lecturerRead = await request("/transkrip/247006111001", {
    headers: userHeaders(dosen, "device-dosen1"),
  });

  assert.equal(lecturerRead.status, 403);

  console.log("LULUS: dosen ditolak pada endpoint transkrip.");

  const userSync = await request("/transkrip/sinkron", {
    method: "POST",
    headers: {
      ...userHeaders(admin, "device-admin"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ class_id: 1 }),
  });

  assert.equal(userSync.status, 403);

  console.log("LULUS: token admin ditolak untuk sinkronisasi.");

  const serviceLogin = await request("/auth/service", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.serviceClientId,
      client_secret: config.serviceClientSecret,
    }),
  });

  assert.equal(serviceLogin.status, 200);

  const serviceToken = serviceLogin.data.access_token;

  const prematureSync = await request("/transkrip/sinkron", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ class_id: 1 }),
  });

  assert.equal(prematureSync.status, 409);

  console.log("LULUS: kelas belum final tidak disinkronkan.");

  const serviceRead = await request("/transkrip/247006111001", {
    headers: {
      Authorization: `Bearer ${serviceToken}`,
    },
  });

  assert.equal(serviceRead.status, 403);

  console.log("LULUS: token service tidak boleh membaca transkrip.");

  console.log("");
  console.log("LULUS: 7 pengujian integrasi Service Transkrip.");
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});