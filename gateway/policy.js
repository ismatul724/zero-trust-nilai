const db = require("../shared/database");
const config = require("../shared/config");
const { verifyToken } = require("../shared/token");

function parseTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Konfigurasi jam harus berformat HH:mm.");
  }

  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

const startMinute = parseTime(process.env.ACCESS_START || "07:00");
const endMinute = parseTime(process.env.ACCESS_END || "21:00");

if (startMinute >= endMinute) {
  throw new Error("ACCESS_START harus lebih awal dari ACCESS_END.");
}

function withinAccessHours(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  const current = hour * 60 + minute;

  return current >= startMinute && current < endMinute;
}

function authorize(req, now = new Date()) {
  let subject = "anonymous";

  function deny(status, reason) {
    return { allow: false, status, reason, subject };
  }

  function allow(context) {
    return {
      allow: true,
      status: 200,
      reason: "Diizinkan oleh kebijakan",
      subject,
      context,
    };
  }

  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return deny(401, "Bearer token wajib disertakan");
  }

  let claims;

   try {
    claims = verifyToken(match.at(1));
  } catch (error) {
    console.error(
      "Detail verifikasi JWT:",
      error.name,
      "-",
      error.message
    );

    return deny(401, "Token tidak valid atau kedaluwarsa");
  }

  if (
    typeof claims !== "object" ||
    claims === null ||
    !Number.isFinite(claims.exp)
  ) {
    return deny(401, "Payload atau masa berlaku token tidak valid");
  }

  const method = req.method.toUpperCase();
  const path = req.path;

  if (claims.token_type === "service") {
    if (
      claims.role !== "service" ||
      claims.sub !== config.serviceClientId
    ) {
      return deny(403, "Identitas service tidak diizinkan");
    }

    subject = `service:${claims.sub}`;

    if (method === "POST" && path === "/transkrip/sinkron") {
      return allow({
        type: "service",
        serviceId: claims.sub,
      });
    }

    return deny(403, "Token service hanya boleh melakukan sinkronisasi");
  }

  if (
    claims.token_type !== "access" ||
    !["admin", "dosen", "mahasiswa"].includes(claims.role) ||
    typeof claims.sub !== "string" ||
    !/^[1-9]\d*$/.test(claims.sub)
  ) {
    return deny(401, "Identitas atau jenis token user tidak valid");
  }

  const userId = Number(claims.sub);

  if (!Number.isSafeInteger(userId)) {
    return deny(401, "ID user tidak valid");
  }

  const user = db.prepare(`
    SELECT id, username, role, nim
    FROM users
    WHERE id = ? AND active = 1
  `).get(userId);

  if (!user || user.role !== claims.role) {
    return deny(401, "User tidak aktif atau role token tidak sesuai");
  }

  subject = `user:${user.id}`;

  const deviceId = req.get("X-Device-ID");

  if (!deviceId || deviceId !== claims.device_id) {
    return deny(403, "Device tidak ada atau tidak sesuai token");
  }

  const device = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ? AND device_id = ? AND active = 1
  `).get(user.id, deviceId);

  if (!device) {
    return deny(403, "Device tidak terdaftar atau tidak aktif");
  }

  if (method === "POST" && path === "/transkrip/sinkron") {
    return deny(403, "Sinkronisasi hanya diizinkan untuk Service Nilai");
  }

  if (method === "GET" && path === "/nilai") {
    if (user.role === "mahasiswa") {
      return allow({
        type: "user",
        user,
        scope: { studentId: user.id },
      });
    }

    if (user.role === "dosen") {
      return allow({
        type: "user",
        user,
        scope: { lecturerId: user.id },
      });
    }

    return deny(403, "Role tidak diizinkan melihat nilai");
  }

  const gradeRoute = path.match(/^\/nilai\/([1-9]\d*)$/);
  const finalizeRoute = path.match(
    /^\/kelas\/([1-9]\d*)\/finalisasi$/
  );

  const isUpdate = method === "PUT" && gradeRoute;
  const isFinalize = method === "POST" && finalizeRoute;

  if (isUpdate || isFinalize) {
    if (user.role !== "dosen") {
      return deny(403, "Operasi ini hanya diizinkan untuk dosen");
    }

    const resourceId = Number(
      (isUpdate ? gradeRoute : finalizeRoute).at(1)
    );

    if (!Number.isSafeInteger(resourceId)) {
      return deny(400, "ID resource tidak valid");
    }

    const classroom = isUpdate
      ? db.prepare(`
          SELECT c.*
          FROM grades g
          JOIN classes c ON c.id = g.class_id
          WHERE g.id = ?
        `).get(resourceId)
      : db.prepare(`
          SELECT * FROM classes WHERE id = ?
        `).get(resourceId);

    if (!classroom) {
      return deny(404, "Nilai atau kelas tidak ditemukan");
    }

    if (classroom.lecturer_id !== user.id) {
      return deny(403, "Kelas bukan milik dosen ini");
    }

      if (classroom.finalized === 1 && isUpdate) {
      return deny(409, "Nilai kelas sudah final");
    }

    if (!withinAccessHours(now)) {
      return deny(403, "Operasi berada di luar jam akses");
    }

    return allow({
      type: "user",
      user,
      classId: classroom.id,
      ...(isUpdate ? { gradeId: resourceId } : {}),
    });
  }

  const transcriptRoute = path.match(/^\/transkrip\/([^/]+)$/);

  if (method === "GET" && transcriptRoute) {
    if (!["mahasiswa", "admin"].includes(user.role)) {
      return deny(403, "Role tidak diizinkan melihat transkrip");
    }

    let nim;

    try {
      nim = decodeURIComponent(transcriptRoute.at(1));
    } catch {
      return deny(400, "Format NIM tidak valid");
    }

    if (user.role === "mahasiswa" && user.nim !== nim) {
      return deny(403, "Mahasiswa hanya boleh melihat transkrip sendiri");
    }

    const student = db.prepare(`
      SELECT id
      FROM users
      WHERE nim = ? AND role = 'mahasiswa'
    `).get(nim);

    if (!student) {
      return deny(404, "Mahasiswa tidak ditemukan");
    }

    return allow({
      type: "user",
      user,
      nim,
      studentId: student.id,
    });
  }

  return deny(403, "Tidak ada kebijakan yang mengizinkan request");
}

module.exports = { authorize };