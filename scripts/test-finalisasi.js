const assert = require("node:assert/strict");

const baseUrl = "http://127.0.0.1:3000";

async function request(path, method, token, device, body) {
  const headers = {
    "Content-Type": "application/json",
    "X-Device-ID": device,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(35000),
  });

  return {
    status: response.status,
    data: await response.json(),
  };
}

async function login(username, device) {
  const result = await request(
    "/auth/login",
    "POST",
    null,
    device,
    {
      username,
      password: "Praktikum123!",
    }
  );

  assert.equal(result.status, 200, `Login ${username} gagal`);
  return result.data.access_token;
}

async function main() {
  const dosen1 = await login("dosen1", "device-dosen1");
  const dosen2 = await login("dosen2", "device-dosen2");
  const mahasiswa = await login("mhs1", "device-mhs1");

  const forbidden = await request(
    "/kelas/1/finalisasi",
    "POST",
    dosen2,
    "device-dosen2",
    {}
  );

  assert.equal(forbidden.status, 403);
  console.log("LULUS: dosen lain tidak boleh finalisasi kelas 1.");

  const finalized = await request(
    "/kelas/1/finalisasi",
    "POST",
    dosen1,
    "device-dosen1",
    {}
  );

  console.log("Respons finalisasi:", finalized.data.message);

  assert.equal(finalized.status, 200);
  assert.equal(finalized.data.finalized, true);
  assert.equal(finalized.data.synchronized, true);
  assert.equal(finalized.data.total, 2);

  console.log("LULUS: kelas final dan 2 nilai disinkronkan.");

  const transcript = await request(
    "/transkrip/247006111001",
    "GET",
    mahasiswa,
    "device-mhs1"
  );

  assert.equal(transcript.status, 200);

  const classRows = transcript.data.data.filter(
    (row) => row.class_id === 1
  );

  assert.equal(classRows.length, 1);

  console.log("LULUS: nilai kelas 1 masuk transkrip mahasiswa.");

  const update = await request(
    "/nilai/1",
    "PUT",
    dosen1,
    "device-dosen1",
    { score: 99 }
  );

  assert.equal(update.status, 409);

  console.log("LULUS: nilai final tidak dapat diubah.");

  const repeated = await request(
    "/kelas/1/finalisasi",
    "POST",
    dosen1,
    "device-dosen1",
    {}
  );

  assert.equal(repeated.status, 200);

  const afterRepeat = await request(
    "/transkrip/247006111001",
    "GET",
    mahasiswa,
    "device-mhs1"
  );

  assert.equal(afterRepeat.status, 200);
  assert.equal(
    afterRepeat.data.data.filter(
      (row) => row.class_id === 1
    ).length,
    1
  );

  console.log("LULUS: finalisasi ulang tidak membuat duplikat.");
  console.log("");
  console.log("LULUS: 5 pengujian alur finalisasi.");
}

main().catch((error) => {
  console.error("PENGUJIAN GAGAL:", error.message);
  process.exitCode = 1;
});