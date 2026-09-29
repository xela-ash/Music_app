// Password-reset preview. The backend has no reset endpoints yet (Authentication
// specification, target MVP). The request never reveals whether an account
// exists — it always resolves the same way.
import { DemoError } from "./store";

const LATENCY_MS = import.meta.env.MODE === "test" ? 0 : 200;
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

export async function requestPasswordReset(email: string): Promise<void> {
  await wait();
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new DemoError(400, "Enter a valid email address.");
}

export async function resetPassword(newPassword: string): Promise<void> {
  await wait();
  if (newPassword.length < 8) throw new DemoError(400, "Password must be at least 8 characters.");
  if (new TextEncoder().encode(newPassword).length > 72) throw new DemoError(400, "Password must not exceed 72 bytes.");
}
