const express = require("express");

const db = require("../shared/database");
const config = require("../shared/config");
const verifyServiceRequest = require(
  "../shared/verify-service-request"
);

const app = express();

app.disable("x-powered-by");

app.use(verifyServiceRequest);
app.use(express.json({ limit: "32kb" }));

app.get("/transkrip/:nim", (req, res) => {
  const claims = req.auth;

  if (
    claims.token_type !== "access" ||
    typeof claims.sub !== "string" ||
    !/^[1-9]\d*$/.test(claims.sub)
  ) {
    return res.status(403).json({
      message: "Melihat transkrip memerlukan token user.",
    });
  }

  const userId = Number(claims.sub);

  if (!Number.isSafeInteger(userId)) {
    return res.status(401).json({
      message: "Identitas user tidak valid.",
    });
  }

  const user = db.prepare(`
    SELECT id, role, nim
    FROM users
    WHERE id = ? AND active = 1
  `).get(userId);

  if (!user || user.role !== claims.role) {
    return res.status(401).json({
      message: "User tidak aktif atau role tidak sesuai.",
    });
  }

  if (!["mahasiswa", "admin"].includes(user.role)) {
    return res.status(403).json({
      message: "Role tidak diizinkan melihat transkrip.",
    });
  }

  const nim = req.params.nim;

  if (user.role === "mahasiswa" && user.nim !== nim) {
    return res.status(403).json({
      message: "Mahasiswa hanya boleh melihat transkrip sendiri.",
    });
  }

  const student = db.prepare(`
    SELECT id, nim, name
    FROM users
    WHERE nim = ? AND role = 'mahasiswa'
  `).get(nim);

  if (!student) {
    return res.status(404).json({
      message: "Mahasiswa tidak ditemukan.",
    });
  }

  const rows = db.prepare(`
    SELECT
      t.id,
      c.id AS class_id,
      c.code AS class_code,
      c.name AS class_name,
      t.score,
      t.synced_at
    FROM transcripts t
    JOIN classes c ON c.id = t.class_id
    WHERE t.student_id = ?
    ORDER BY c.id
  `).all(student.id);

  return res.json({
    mahasiswa: {
      nim: student.nim,
      name: student.name,
    },
    data: rows,
  });
});

const syncTranscript = db.transaction((classId) => {
  const classroom = db.prepare(`
    SELECT id, finalized
    FROM classes
    WHERE id = ?
  `).get(classId);

  if (!classroom) {
    return {
      status: 404,
      message: "Kelas tidak ditemukan.",
    };
  }

  if (classroom.finalized !== 1) {
    return {
      status: 409,
      message: "Kelas belum final. Transkrip tidak disinkronkan.",
    };
  }

  const grades = db.prepare(`
    SELECT class_id, student_id, score
    FROM grades
    WHERE class_id = ?
  `).all(classId);

  const upsert = db.prepare(`
    INSERT INTO transcripts
      (class_id, student_id, score, synced_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(class_id, student_id)
    DO UPDATE SET
      score = excluded.score,
      synced_at = CURRENT_TIMESTAMP
  `);

  for (const grade of grades) {
    upsert.run(
      grade.class_id,
      grade.student_id,
      grade.score
    );
  }

  return {
    status: 200,
    message: "Transkrip berhasil disinkronkan.",
    class_id: classId,
    total: grades.length,
  };
});

app.post("/transkrip/sinkron", (req, res) => {
  const claims = req.auth;

  if (
    claims.token_type !== "service" ||
    claims.role !== "service" ||
    claims.sub !== config.serviceClientId
  ) {
    return res.status(403).json({
      message: "Sinkronisasi hanya diizinkan untuk Service Nilai.",
    });
  }

  const classId = req.body?.class_id;

  if (!Number.isSafeInteger(classId) || classId <= 0) {
    return res.status(400).json({
      message: "class_id harus berupa bilangan bulat positif.",
    });
  }

  const result = syncTranscript.immediate(classId);

  return res.status(result.status).json({
    message: result.message,
    ...(result.status === 200
      ? {
          class_id: result.class_id,
          total: result.total,
        }
      : {}),
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint Service Transkrip tidak ditemukan.",
  });
});

app.use((err, req, res, next) => {
  console.error("Service Transkrip:", err.message);

  const badJson = err.type === "entity.parse.failed";
  const tooLarge = err.type === "entity.too.large";

  res.status(badJson ? 400 : tooLarge ? 413 : 500).json({
    message: badJson
      ? "Format JSON tidak valid."
      : tooLarge
        ? "Ukuran request terlalu besar."
        : "Terjadi kesalahan internal Service Transkrip.",
  });
});

app.listen(3002, "127.0.0.1", () => {
  console.log(
    "Service Transkrip berjalan di http://127.0.0.1:3002"
  );
});