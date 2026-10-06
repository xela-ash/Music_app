const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const workflowPath = path.join(__dirname, "../../.github/workflows/ci.yml");

function jobBlock(yaml, jobId) {
  const jobsAt = yaml.indexOf("\njobs:\n");
  assert.ok(jobsAt >= 0, "workflow has no jobs section");
  const lines = yaml.slice(jobsAt + "\njobs:\n".length).split("\n");
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.ok(start >= 0, `missing job ${jobId}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^  [a-z0-9-]+:$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

describe("MVP-004 CI workflow (SEC-PROJECTS-019 gate)", () => {
  it("defines separate lint, frontend test, backend test, and migration dry-run jobs", () => {
    const yaml = fs.readFileSync(workflowPath, "utf8");
    const lint = jobBlock(yaml, "lint");
    const frontend = jobBlock(yaml, "frontend-test");
    const backend = jobBlock(yaml, "backend-test");
    const migrate = jobBlock(yaml, "migration-dry-run");

    assert.match(lint, /pnpm lint/);
    assert.doesNotMatch(lint, /npm test/);
    assert.match(frontend, /pnpm test/);
    assert.doesNotMatch(frontend, /pnpm lint/);
    assert.match(backend, /npm test/);
    assert.match(migrate, /npm run migrate/);
    assert.equal((migrate.match(/npm run migrate/g) || []).length, 2);
  });

  it("runs backend tests only against the isolated database name and port", () => {
    const yaml = fs.readFileSync(workflowPath, "utf8");
    const backend = jobBlock(yaml, "backend-test");

    assert.match(backend, /postgres:16/);
    assert.match(backend, /DB_NAME: musicapp_mvp001/);
    assert.match(backend, /DB_PORT: "5433"/);
    assert.doesNotMatch(backend, /DB_PORT: "5432"/);
    assert.doesNotMatch(backend, /DB_NAME: musicapp\b/);
    assert.doesNotMatch(backend, /musicapp_ci_migrate/);
  });

  it("gives backend-test a TCP fixture-reset connection, because Actions has no local postgres user", () => {
    const yaml = fs.readFileSync(workflowPath, "utf8");
    const backend = jobBlock(yaml, "backend-test");

    assert.match(backend, /MUSICAPP_TEST_ADMIN_USER: musicapp/);
    assert.match(backend, /MUSICAPP_TEST_ADMIN_PASSWORD: musicapp/);
    assert.match(backend, /POSTGRES_USER: musicapp/);
  });

  it("applies migrations to a disposable database and never to the test database", () => {
    const yaml = fs.readFileSync(workflowPath, "utf8");
    const migrate = jobBlock(yaml, "migration-dry-run");

    assert.match(migrate, /postgres:16/);
    assert.match(migrate, /DB_NAME: musicapp_ci_migrate/);
    assert.match(migrate, /DB_PORT: "5432"/);
    assert.doesNotMatch(migrate, /musicapp_mvp001/);
    assert.doesNotMatch(migrate, /npm test/);
  });
});
