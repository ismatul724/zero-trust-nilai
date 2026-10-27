const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(__dirname, "..", ".env");

function createSecret() {
  return crypto.randomBytes(32).toString("hex");
}

if (fs.existsSync(envPath)) {
  console.log(
    ".env sudah ada. Konfigurasi dan secret tidak diubah."
  );
} else {
  const content = [
    "GATEWAY_PORT=3000",
    "",
    `JWT_SECRET=${createSecret()}`,
    "SERVICE_CLIENT_ID=service-nilai",
    `SERVICE_CLIENT_SECRET=${createSecret()}`,
    `GATEWAY_SECRET=${createSecret()}`,
    "",
    "ACCESS_START=07:00",
    "ACCESS_END=21:00",
    "",
  ].join("\n");

  fs.writeFileSync(envPath, content, {
    encoding: "utf8",
    flag: "wx",
  });

  console.log(".env berhasil dibuat dengan secret acak.");
  console.log("Jam akses awal: 07:00-21:00 WIB.");
  console.log("Nilai secret tidak ditampilkan.");
}