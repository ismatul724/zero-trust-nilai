const net = require("node:net");
const path = require("node:path");

function isPortOpen(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port,
    });

    socket.setTimeout(1500);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", (error) => {
      socket.destroy();

      if (error.code === "ECONNREFUSED") {
        resolve(false);
      } else {
        reject(error);
      }
    });

    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Pemeriksaan port ${port} timeout.`));
    });
  });
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.log("Belum ada data yang diubah.");
    console.log("");
    console.log("Reset demo akan:");
    console.log("- Membuat backup database.");
    console.log("- Membuka kembali kedua kelas.");
    console.log("- Memulihkan empat nilai awal.");
    console.log("- Menghapus transkrip, refresh token, dan audit log.");
    console.log("- Mempertahankan akun, device, dan konfigurasi.");
    console.log("");
    console.log("Hentikan ketiga server sebelum reset.");
    console.log("Untuk menjalankan:");
    console.log("npm run reset-demo -- --confirm");
    return;
  }

  const config = require("../shared/config");

  for (const port of [config.gatewayPort, 3001, 3002]) {
    if (await isPortOpen(port)) {
      throw new Error(
        `Port ${port} masih digunakan. Hentikan server dahulu.`
      );
    }
  }

  const db = require("../shared/database");

  try {
    const expected = [
      { id: 1, class_id: 1, student_id: 4, score: 80 },
      { id: 2, class_id: 1, student_id: 5, score: 85 },
      { id: 3, class_id: 2, student_id: 5, score: 75 },
      { id: 4, class_id: 2, student_id: 6, score: 90 },
    ];

    const grades = db.prepare(`
      SELECT id, class_id, student_id
      FROM grades
      ORDER BY id
    `).all();

    const classes = db.prepare(`
      SELECT id, lecturer_id
      FROM classes
      ORDER BY id
    `).all();

    if (
      grades.length !== 4 ||
      classes.length !== 2 ||
      classes.at(0).id !== 1 ||
      classes.at(0).lecturer_id !== 2 ||
      classes.at(1).id !== 2 ||
      classes.at(1).lecturer_id !== 3
    ) {
      throw new Error(
        "Struktur data berbeda dari seed praktikum. Reset dibatalkan."
      );
    }

    for (const item of expected) {
      const actual = grades.find((row) => row.id === item.id);

      if (
        !actual ||
        actual.class_id !== item.class_id ||
        actual.student_id !== item.student_id
      ) {
        throw new Error(
          "Relasi nilai berbeda dari seed. Reset dibatalkan."
        );
      }
    }

    const backupPath = path.join(
      __dirname,
      "..",
      "data",
      `backup-demo-${Date.now()}.db`
    );

    await db.backup(backupPath);

    console.log("Backup berhasil dibuat:", backupPath);

    const reset = db.transaction(() => {
      db.prepare("DELETE FROM transcripts").run();
      db.prepare("DELETE FROM refresh_tokens").run();
      db.prepare("DELETE FROM audit_logs").run();

      db.prepare(`
        UPDATE classes
        SET finalized = 0,
            finalized_at = NULL
      `).run();

      const updateScore = db.prepare(`
        UPDATE grades
        SET score = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (const item of expected) {
        updateScore.run(item.score, item.id);
      }
    });

    reset.immediate();

    console.log("Reset data demo berhasil.");
    console.log("Akun, device, .env, dan secret tidak diubah.");
    console.log("Login ulang setelah server dijalankan kembali.");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error("RESET GAGAL:", error.message);
  process.exitCode = 1;
});