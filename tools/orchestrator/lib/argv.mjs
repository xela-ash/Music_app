const BANNED = new Set(["--resume", "--continue", "--yolo", "resume"]);

export function assertFreshInvocation(args) {
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new Error("Agent arguments must be strings");
    }
    if (BANNED.has(arg) || arg.startsWith("--resume=") || arg.startsWith("--continue=")) {
      throw new Error("Refusing to resume or continue an existing agent conversation");
    }
  }
  return args;
}

export function buildAgentArgs({ mode, workspace, force = false, sandbox, prompt }) {
  if (mode !== "ask" && mode !== "agent") {
    throw new Error(`Unsupported agent mode: ${mode}`);
  }
  if (force && mode !== "agent") {
    throw new Error("Refusing --force outside agent mode");
  }
  if (sandbox !== "enabled" && sandbox !== "disabled") {
    throw new Error(`Unsupported sandbox mode: ${sandbox}`);
  }
  if (!prompt || prompt.startsWith("-")) {
    throw new Error("Prompt must be non-empty text and must not look like a flag");
  }
  const args = [
    "-p",
    "--output-format",
    "json",
    "--mode",
    mode,
    "--trust",
    "--workspace",
    workspace,
    "--sandbox",
    sandbox,
  ];
  if (force) args.push("--force");
  args.push(prompt);
  return assertFreshInvocation(args);
}
