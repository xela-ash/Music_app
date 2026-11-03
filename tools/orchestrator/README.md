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

## Tests

```bash
node --test tools/orchestrator/test/orchestrator.test.mjs
```
