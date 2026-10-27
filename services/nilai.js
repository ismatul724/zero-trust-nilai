const config = require("../shared/config");
const express = require("express");
const db = require("../shared/database");
const verifyServiceRequest = require(
  "../shared/verify-service-request"
);

const app = express();

app.disable("x-powered-by");

app.use(verifyServiceRequest);
app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  const claims = req.auth;

  if (
    claims.token_type !== "access" ||
    typeof claims.sub !== "string" ||
    !/^[1-9]\d*$/.test(claims.sub)
  ) {
    return res.status(403).json({
      message: "Endpoint nilai memerlukan token user.",
    });
  }

  const userId = Number(claims.sub);

  if (!Number.isSafeInteger(userId)) {
    return res.status(401).json({
      message: "Identitas user tidak valid.",
    });
  }

  const user = db.prepare(`
    SELECT id, username, role, nim
    FROM users
    WHERE id = ? AND active = 1
  `).get(userId);

  if (!user || user.role !== claims.role) {
    return res.status(401).json({
      message: "User tidak aktif atau role tidak sesuai.",
    });
  }

  req.user = user;
  next();
});

app.get("/nilai", (req, res) => {
  const user = req.user;

  if (!["mahasiswa", "dosen"].includes(user.role)) {
    return res.status(403).json({
      message: "Role tidak diizinkan melihat nilai.",
    });
  }

  const filter = user.role === "mahasiswa"
    ? "g.student_id = ?"
    : "c.lecturer_id = ?";

  const rows = db.prepare(`
    SELECT
      g.id,
      c.id AS class_id,
      c.code AS class_code,
      c.name AS class_name,
      u.nim,
      u.name AS student_name,
      g.score,
      c.finalized
    FROM grades g
    JOIN classes c ON c.id = g.class_id
    JOIN users u ON u.id = g.student_id
    WHERE ${filter}
    ORDER BY c.id, u.nim
  `).all(user.id);

  res.json({ data: rows });
});

app.put("/nilai/:id", (req, res) => {
  if (req.user.role !== "dosen") {
    return res.status(403).json({
      message: "Hanya dosen yang boleh mengubah nilai.",
    });
  }

  if (!/^[1-9]\d*$/.test(req.params.id)) {
    return res.status(400).json({
      message: "ID nilai tidak valid.",
    });
  }

  const gradeId = Number(req.params.id);
  const score = req.body?.score;

  if (!Number.isSafeInteger(gradeId)) {
    return res.status(400).json({
      message: "ID nilai tidak valid.",
    });
  }

  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    return res.status(400).json({
      message: "Score harus berupa angka antara 0 dan 100.",
    });
  }

  const grade = db.prepare(`
    SELECT g.id, c.lecturer_id, c.finalized
    FROM grades g
    JOIN classes c ON c.id = g.class_id
    WHERE g.id = ?
  `).get(gradeId);

  if (!grade) {
    return res.status(404).json({
      message: "Nilai tidak ditemukan.",
    });
  }

  if (grade.lecturer_id !== req.user.id) {
    return res.status(403).json({
      message: "Kelas bukan milik dosen ini.",
    });
  }

  if (grade.finalized === 1) {
    return res.status(409).json({
      message: "Nilai kelas sudah final.",
    });
  }

  const result = db.prepare(`
    UPDATE grades
    SET score = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND class_id IN (
        SELECT id
        FROM classes
        WHERE lecturer_id = ? AND finalized = 0
      )
  `).run(score, gradeId, req.user.id);

  if (result.changes !== 1) {
    return res.status(409).json({
      message: "Status kelas berubah. Nilai tidak diperbarui.",
    });
  }

  return res.json({
    message: "Nilai berhasil diperbarui.",
    data: { id: gradeId, score },
  });
});

app.post("/kelas/:id/finalisasi", async (req, res) => {
  if (req.user.role !== "dosen") {
    return res.status(403).json({
      message: "Hanya dosen yang boleh memfinalisasi kelas.",
    });
  }

  if (!/^[1-9]\d*$/.test(req.params.id)) {
    return res.status(400).json({
      message: "ID kelas tidak valid.",
    });
  }

  const classId = Number(req.params.id);

  if (!Number.isSafeInteger(classId)) {
    return res.status(400).json({
      message: "ID kelas tidak valid.",
    });
  }

  const classroom = db.prepare(`
    SELECT id, lecturer_id, finalized
    FROM classes
    WHERE id = ?
  `).get(classId);

  if (!classroom) {
    return res.status(404).json({
      message: "Kelas tidak ditemukan.",
    });
  }

  if (classroom.lecturer_id !== req.user.id) {
    return res.status(403).json({
      message: "Kelas bukan milik dosen ini.",
    });
  }

  db.prepare(`
    UPDATE classes
    SET finalized = 1,
        finalized_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND lecturer_id = ?
      AND finalized = 0
  `).run(classId, req.user.id);

  const gatewayUrl =
    `http://127.0.0.1:${config.gatewayPort}`;

  try {
    const authResponse = await fetch(
      `${gatewayUrl}/auth/service`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: config.serviceClientId,
          client_secret: config.serviceClientSecret,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!authResponse.ok) {
      throw new Error(
        `Penerbitan token service gagal: HTTP ${authResponse.status}`
      );
    }

    const tokenData = await authResponse.json();

    if (typeof tokenData.access_token !== "string") {
      throw new Error("Respons tidak memuat token service.");
    }

    const syncResponse = await fetch(
      `${gatewayUrl}/transkrip/sinkron`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        body: JSON.stringify({
          class_id: classId,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!syncResponse.ok) {
      throw new Error(
        `Sinkronisasi gagal: HTTP ${syncResponse.status}`
      );
    }

    const syncData = await syncResponse.json();

    return res.json({
      message: "Kelas final dan transkrip berhasil disinkronkan.",
      class_id: classId,
      finalized: true,
      synchronized: true,
      total: syncData.total,
    });
  } catch (error) {
    console.error("Finalisasi/sinkronisasi:", error.message);

    return res.status(502).json({
      message:
        "Kelas sudah final, tetapi sinkronisasi belum dikonfirmasi. " +
        "Ulangi finalisasi untuk mencoba sinkronisasi kembali.",
      class_id: classId,
      finalized: true,
      synchronized: false,
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint Service Nilai tidak ditemukan.",
  });
});

app.use((err, req, res, next) => {
  console.error("Service Nilai:", err.message);

  const badJson = err.type === "entity.parse.failed";
  const tooLarge = err.type === "entity.too.large";

  res.status(badJson ? 400 : tooLarge ? 413 : 500).json({
    message: badJson
      ? "Format JSON tidak valid."
      : tooLarge
        ? "Ukuran request terlalu besar."
        : "Terjadi kesalahan internal Service Nilai.",
  });
});

app.listen(3001, "127.0.0.1", () => {
  console.log(
    "Service Nilai berjalan di http://127.0.0.1:3001"
  );
});