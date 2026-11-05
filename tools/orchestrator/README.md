# Stateless build orchestrator

This tool runs one MVP issue per fresh Cursor agent process. It does not resume a chat and it does not copy earlier transcripts into the next prompt. GitHub issues, pull requests, commits, and the engineering documents remain the durable record. `.orchestrator/` is local control state and is gitignored.

`start` is disabled until a continuous loop is explicitly enabled. `once` runs a single issue in a clean worktree of `main` and stops. A successful dry run used to tell the operator that proof was still required even after `status` showed `freshContextProved: true`, because that sentence did not read the proof file. It now does. `once` still refuses to run until `prove-fresh` has recorded two different agent session ids. A unit test is not that proof.

## Commands

```bash
node tools/orchestrator/cli.mjs status
node tools/orchestrator/cli.mjs prove-fresh
node tools/orchestrator/cli.mjs dry-run
node tools/orchestrator/cli.mjs once --only MVP-011 --workspace <clean main worktree>
node tools/orchestrator/cli.mjs start
node tools/orchestrator/cli.mjs pause
node tools/orchestrator/cli.mjs stop
```

The agent binary is `CURSOR_AGENT_BIN`, then `~/.local/bin/agent`, then `agent` on `PATH`. Authentication is `agent login` or `CURSOR_API_KEY`. The tool never prints the key.

`pause` and `stop` take effect before the next agent process. They do not kill the process that is already running, and they do not delete branches or pull requests. A second Ctrl+C is left to the shell.

## What each process is allowed to read

The prompt names the issue, its dependencies, and the specification and engineering sections for that issue. It tells the agent to stop rather than open an unlisted document. Implementer, reviewer, and repair runs are separate processes. A repair prompt receives only short defect lines, not the implementer transcript.

Preferred order is `MVP-011`, then `MVP-012`, then the next dependency-ready `AUTONOMOUS-READY` item. A blocked item is recorded and skipped. `HUMAN-DECISION-REQUIRED` and `EXTERNAL-DEPENDENCY` items are reported and are not merged by this tool.

## Retries and merge

Transient agent failures (timeouts, rate limits, connection resets) retry twice. Any other failure is recorded and the loop moves on. Review defects get two fresh repair runs. The loop then stops that item.

Merge uses `gh pr merge --squash` only after all 15 gates in `AGENTS.md` section 5.1 pass. The command never includes `--admin`. Required checks are `lint`, `frontend-test`, `backend-test`, and `migration-dry-run`.

## Cloud controller

GitHub Actions runs the controller. The laptop CLI is not the production path. `start` remains disabled. A schedule, a successful CI run, or a manual dispatch runs one tick. The concurrency group `musicapp-orchestrator` keeps overlapping runs from dispatching the same work. Each tick persists state on the branch `orchestrator/controller-state`.

The controller creates a new Cloud Agent for every implementation, review, repair, and proof. It never posts a follow-up run to an existing agent. Review and repair therefore do not inherit the implementer's conversation. `autoCreatePR` is false, and the agent does not push to `main`.

Manual actions are `arm`, `tick`, `prove`, and `stop`. `arm` only records that ticks may run. `prove` launches one read-only agent. `stop` cancels the active run and refuses later ticks until `arm` is dispatched again. Product work stays idle until the repository variable `ORCHESTRATOR_CLOUD_TRIAL` names one MVP id. Unattended merge stays off unless `ORCHESTRATOR_ALLOW_MERGE` is set to `true` in an environment that has already passed review. This workflow does not set it. A pull request that changes `tools/orchestrator/` or this workflow cannot pass the scope gate, so the controller cannot merge its own governance changes.

The tick fails closed when the Cursor API key is missing, the agent or run status is missing, the API errors, the reply is malformed, usage is missing, review flags are not explicit `false`, the head SHA is stale, CI is incomplete, a secret-shaped path appears, or another controller lock is still current. At most one agent is active. At most four new agents are recorded in a day. The recorded token total stops new work at 2,000,000 tokens. Those are controller limits, not a billing cap.

Cursor bills Cloud Agents at the selected model's rate, from the plan's included usage and then from on-demand usage. There is no separate VM charge. The account spend limit in the Cursor dashboard is the dollar control, and a run will not start without about $2 of headroom under that limit. Leaving the trial variable unset, the daily dispatch cap, and the token ceiling are the repository-side safeguards. Do not raise them to start unattended implementation.

### Secrets and access

Create a Cursor API key at Cursor Dashboard → API Keys, or use a service-account key. Store it as the Actions secret `CURSOR_API_KEY`. Do not put the value in the repository, the workflow log, or an agent prompt. The workflow checks that the secret is non-empty and never prints it.

The Cursor account that owns the key must be connected to `xela-ash/Music_app`. Cloud agents use `.cursor/environment.json` and `.cursor/Dockerfile`, which install Node, pnpm, and the isolated PostgreSQL test cluster. No GitHub token is injected into the agent environment by this controller.

```bash
gh secret set CURSOR_API_KEY --repo xela-ash/Music_app
```

## Tests

```bash
node --test tools/orchestrator/test/orchestrator.test.mjs tools/orchestrator/test/cloud.test.mjs
```
