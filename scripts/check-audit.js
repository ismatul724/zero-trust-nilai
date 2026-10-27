const assert = require("node:assert/strict");
const db = require("../shared/database");

try {
  console.log("=== 15 AUDIT LOG TERBARU ===");

  const latestLogs = db.prepare(`
    SELECT
      id,
      time,
      subject,
      method,
      endpoint,
      device,
      decision,
      reason
    FROM audit_logs
    ORDER BY id DESC
    LIMIT 15
  `).all();

  console.table(latestLogs);

  console.log("=== RINGKASAN KEPUTUSAN ===");

  console.table(
    db.prepare(`
      SELECT decision, COUNT(*) AS total
      FROM audit_logs
      GROUP BY decision
    `).all()
  );

  const checks = [
    {
      label: "Keputusan allow tercatat",
      sql: `
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE decision = 'allow'
      `,
    },
    {
      label: "Keputusan deny tercatat",
      sql: `
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE decision = 'deny'
      `,
    },
    {
      label: "Finalisasi oleh dosen tercatat",
      sql: `
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE method = 'POST'
          AND endpoint = '/kelas/1/finalisasi'
          AND subject = 'user:2'
          AND device = 'device-dosen1'
          AND decision = 'allow'
      `,
    },
    {
      label: "Sinkronisasi oleh Service Nilai tercatat",
      sql: `
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE method = 'POST'
          AND endpoint = '/transkrip/sinkron'
          AND subject = 'service:service-nilai'
          AND decision = 'allow'
      `,
    },
  ];

  for (const check of checks) {
    const result = db.prepare(check.sql).get();

    assert.ok(result.total > 0, check.label);

    console.log(`LULUS: ${check.label}.`);
  }

  const incomplete = db.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_logs
    WHERE time IS NULL OR TRIM(time) = ''
       OR subject IS NULL OR TRIM(subject) = ''
       OR method IS NULL OR TRIM(method) = ''
       OR endpoint IS NULL OR TRIM(endpoint) = ''
       OR decision IS NULL OR TRIM(decision) = ''
       OR reason IS NULL OR TRIM(reason) = ''
  `).get();

  assert.equal(
    incomplete.total,
    0,
    "Ada audit log dengan field utama kosong."
  );

  console.log("LULUS: seluruh log memiliki field utama.");
  console.log("");
  console.log("LULUS: pemeriksaan audit log.");
} catch (error) {
  console.error("PEMERIKSAAN GAGAL:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}