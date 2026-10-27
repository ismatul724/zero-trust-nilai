const db = require("../shared/database");

const insertLog = db.prepare(`
  INSERT INTO audit_logs
    (subject, method, endpoint, device, decision, reason)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function audit(req, subject, decision, reason) {
  const device = req.get("X-Device-ID") || null;

  insertLog.run(
    String(subject),
    req.method,
    req.originalUrl,
    device,
    decision,
    reason
  );
}

module.exports = audit;
