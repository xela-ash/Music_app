const express = require("express");
const cors = require("cors");
// Load dotenv via the pool module before any module reads JWT_SECRET.
const pool = require("./db/db");
const { router: authRouter } = require("./src/auth/routes");
const usersRouter = require("./src/users/routes");
const profilesRouter = require("./src/profiles/routes");
const projectsRouter = require("./src/projects/routes");
const milestonesRouter = require("./src/milestones/routes");
const notificationsRouter = require("./src/notifications/routes");
const messagingRouter = require("./src/messaging/routes");
const assetsRouter = require("./src/assets/routes");
const { createFundingPayment } = require("./src/payments/service");
const { webhookRouter } = require("./src/payments/routes");
const { requireAuth } = require("./src/auth/routes");
const { installEmailProviderFromEnv } = require("./src/notifications/resend-adapter");

installEmailProviderFromEnv(process.env);

const app = express();
app.use(cors());
app.use("/payments/webhooks", express.raw({ type: () => true, limit: "1mb" }), webhookRouter);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is alive" });
});

app.get("/db-health", async (req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ db: "connected", result: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ db: "error", message: err.message });
  }
});

app.use(usersRouter);
app.use(profilesRouter);
app.use(authRouter);
app.use(projectsRouter);
app.use(milestonesRouter);
app.use(notificationsRouter);
app.use(messagingRouter);
app.use(assetsRouter);

app.post("/projects/:projectId/funding-payments", requireAuth, async (req, res) => {
  const result = await createFundingPayment(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

if (require.main === module) {
  const PORT = 4000;
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

// Exported so the test harness can listen on an ephemeral port.
// `node Index.js` still binds 4000.
module.exports = { app };
