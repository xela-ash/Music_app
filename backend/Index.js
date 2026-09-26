const express = require("express");
const cors = require("cors");
// Load dotenv via the pool module before any module reads JWT_SECRET.
const pool = require("./db/db");
const { router: authRouter } = require("./src/auth/routes");
const usersRouter = require("./src/users/routes");
const profilesRouter = require("./src/profiles/routes");
const projectsRouter = require("./src/projects/routes");
const milestonesRouter = require("./src/milestones/routes");

const app = express();
app.use(cors());
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

if (require.main === module) {
  const PORT = 4000;
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}
