const express = require("express");

const config = require("../shared/config");
const authRoutes = require("./auth");
const audit = require("./audit");
const { authorize } = require("./policy");

const app = express();

app.disable("x-powered-by");

app.use(express.json({ limit: "32kb" }));

app.use("/auth", authRoutes);

app.use(async (req, res) => {
  const decision = authorize(req);

  audit(
    req,
    decision.subject,
    decision.allow ? "allow" : "deny",
    decision.reason
  );

  if (!decision.allow) {
    return res.status(decision.status).json({
      message: decision.reason,
    });
  }

  const isReadGrades =
    req.method === "GET" && req.path === "/nilai";

  const isUpdateGrade =
    req.method === "PUT" &&
    /^\/nilai\/[1-9]\d*$/.test(req.path);

  const isReadTranscript =
    req.method === "GET" &&
    /^\/transkrip\/[^/]+$/.test(req.path);

  const isSyncTranscript =
    req.method === "POST" &&
    req.path === "/transkrip/sinkron";

      const isFinalizeClass =
    req.method === "POST" &&
    /^\/kelas\/[1-9]\d*\/finalisasi$/.test(req.path);

  let targetPort;

if (isReadGrades || isUpdateGrade || isFinalizeClass) {
    targetPort = 3001;
  } else if (isReadTranscript || isSyncTranscript) {
    targetPort = 3002;
  } else {
    return res.status(503).json({
      message: "Endpoint ini belum dihubungkan ke service.",
    });
  }

  const headers = {
    Authorization: req.get("Authorization"),
    "X-Gateway-Secret": config.gatewaySecret,
  };

  const deviceId = req.get("X-Device-ID");

  if (deviceId) {
    headers["X-Device-ID"] = deviceId;
  }

  const options = {
    method: req.method,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(isFinalizeClass ? 30000 : 10000),
  };

  if (["POST", "PUT"].includes(req.method)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(req.body ?? {});
  }

  try {
    const upstream = await fetch(
      `http://127.0.0.1:${targetPort}${req.path}`,
      options
    );

    const responseBody = await upstream.text();

    res.set("Cache-Control", "no-store");
    res.set(
      "Content-Type",
      upstream.headers.get("content-type") ||
        "application/json"
    );

    return res.status(upstream.status).send(responseBody);
  } catch (error) {
    console.error("Gagal menghubungi service:", error.message);

    return res.status(502).json({
      message: "Service tujuan tidak dapat dihubungi.",
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Gateway:", err.message);

  const badJson = err.type === "entity.parse.failed";
  const tooLarge = err.type === "entity.too.large";

  const status = badJson ? 400 : tooLarge ? 413 : 500;

  const message = badJson
    ? "Format JSON tidak valid."
    : tooLarge
      ? "Ukuran request terlalu besar."
      : "Terjadi kesalahan internal.";

  try {
    audit(req, "anonymous", "deny", message);
  } catch (auditError) {
    console.error("Gagal menulis audit:", auditError.message);
  }

  return res.status(status).json({ message });
});

app.listen(config.gatewayPort, "127.0.0.1", () => {
  console.log(
    `API Gateway berjalan di http://127.0.0.1:${config.gatewayPort}`
  );
});