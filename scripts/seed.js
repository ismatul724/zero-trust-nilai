const bcrypt = require("bcryptjs");
const db = require("../shared/database");

const demoPassword = "Praktikum123!";

const users = [
  {
    id: 1,
    username: "admin",
    name: "Admin Informatika",
    role: "admin",
    nim: null,
    device: "device-admin",
  },
  {
    id: 2,
    username: "dosen1",
    name: "Dosen Satu",
    role: "dosen",
    nim: null,
    device: "device-dosen1",
  },
  {
    id: 3,
    username: "dosen2",
    name: "Dosen Dua",
    role: "dosen",
    nim: null,
    device: "device-dosen2",
  },
  {
    id: 4,
    username: "mhs1",
    name: "Mahasiswa Satu",
    role: "mahasiswa",
    nim: "247006111001",
    device: "device-mhs1",
  },
  {
    id: 5,
    username: "mhs2",
    name: "Mahasiswa Dua",
    role: "mahasiswa",
    nim: "247006111002",
    device: "device-mhs2",
  },
  {
    id: 6,
    username: "mhs3",
    name: "Mahasiswa Tiga",
    role: "mahasiswa",
    nim: "247006111003",
    device: "device-mhs3",
  },
];

try {
  const existingUsers = db
    .prepare("SELECT COUNT(*) AS total FROM users")
    .get().total;

  if (existingUsers > 0) {
    console.log(
      "Seed dibatalkan: database sudah memiliki user. Data tidak diubah."
    );
  } else {
    const insertUser = db.prepare(`
      INSERT INTO users
        (id, username, password_hash, name, role, nim)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertDevice = db.prepare(`
      INSERT INTO devices (user_id, device_id)
      VALUES (?, ?)
    `);

    const insertClass = db.prepare(`
      INSERT INTO classes (id, code, name, lecturer_id)
      VALUES (?, ?, ?, ?)
    `);

    const insertGrade = db.prepare(`
      INSERT INTO grades (class_id, student_id, score)
      VALUES (?, ?, ?)
    `);

    const seed = db.transaction(() => {
      for (const user of users) {
        insertUser.run(
          user.id,
          user.username,
          bcrypt.hashSync(demoPassword, 12),
          user.name,
          user.role,
          user.nim
        );

        insertDevice.run(user.id, user.device);
      }

      insertClass.run(
        1,
        "KI-A",
        "Keamanan Informasi A",
        2
      );

      insertClass.run(
        2,
        "KI-B",
        "Keamanan Informasi B",
        3
      );

      insertGrade.run(1, 4, 80);
      insertGrade.run(1, 5, 85);
      insertGrade.run(2, 5, 75);
      insertGrade.run(2, 6, 90);
    });

    seed();

    console.log("Database dan data awal berhasil dibuat.");
  }

  console.table(
    db.prepare(`
      SELECT
        u.username,
        u.role,
        u.nim,
        d.device_id
      FROM users u
      JOIN devices d ON d.user_id = u.id
      ORDER BY u.id
    `).all()
  );

  console.table(
    db.prepare(`
      SELECT
        c.id,
        c.code,
        c.name,
        u.username AS dosen,
        c.finalized
      FROM classes c
      JOIN users u ON u.id = c.lecturer_id
      ORDER BY c.id
    `).all()
  );

  console.log("Password akun demo:", demoPassword);
} catch (error) {
  console.error("Gagal menyiapkan data:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
