const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");

const dataDirectory = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(
  path.join(dataDirectory, "zero-trust.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL
      CHECK (role IN ('admin', 'dosen', 'mahasiswa')),
    nim TEXT UNIQUE,
    active INTEGER NOT NULL DEFAULT 1
      CHECK (active IN (0, 1)),
    CHECK (
      (role = 'mahasiswa' AND nim IS NOT NULL)
      OR
      (role IN ('admin', 'dosen') AND nim IS NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
      CHECK (active IN (0, 1)),
    UNIQUE (user_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    lecturer_id INTEGER NOT NULL REFERENCES users(id),
    finalized INTEGER NOT NULL DEFAULT 0
      CHECK (finalized IN (0, 1)),
    finalized_at TEXT
  );

  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY,
    time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subject TEXT NOT NULL,
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    device TEXT,
    decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
    reason TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_grades_student
    ON grades(student_id);

  CREATE INDEX IF NOT EXISTS idx_classes_lecturer
    ON classes(lecturer_id);
`);

module.exports = db;
