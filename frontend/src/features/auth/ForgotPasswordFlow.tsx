import { useState } from "react";
import type { FormEvent } from "react";
import { requestPasswordReset, resetPassword } from "../../demo/authDemo";
import { getErrorMessage, maskEmail } from "../../lib/format";
import { Field } from "../../ui/controls";
import { PreviewNotice } from "../../ui/feedback";

type Stage = "request" | "sent" | "reset" | "done";

// A07–A10. Password reset isn't implemented on the backend yet; this flow is
// wired to a preview stub. The request stage never says whether the address
// belongs to an account.
export function ForgotPasswordFlow({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setStage("sent");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResent(false);
    await send();
    setResent(true);
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await resetPassword(password);
      setStage("done");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "sent") {
    return (
      <div className="auth-form">
        <h2 className="wizard-title">Check your email</h2>
        <p>
          If an account exists for <strong>{maskEmail(email.trim())}</strong>, we've sent a link to reset your password. It can take a few
          minutes to arrive.
        </p>
        {resent ? <p className="success-message success-inline">Sent again.</p> : null}
        <PreviewNotice>Email delivery isn't connected yet. Use the button below to open the reset screen.</PreviewNotice>
        <div className="content-actions wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={resend} disabled={busy}>
            Resend email
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setStage("reset")}>
            Open reset link (preview)
          </button>
        </div>
        <button type="button" className="link-button auth-link" onClick={onBackToLogin}>
          Back to log in
        </button>
      </div>
    );
  }

  if (stage === "reset") {
    return (
      <form className="auth-form" onSubmit={reset}>
        <h2 className="wizard-title">Choose a new password</h2>
        <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
          <input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-confirm">
          <input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Resetting…" : "Reset password"}
        </button>
      </form>
    );
  }

  if (stage === "done") {
    return (
      <div className="auth-form">
        <h2 className="wizard-title">Password reset</h2>
        <p className="success-message success-inline">Your password has been reset. Log in with your new password.</p>
        <button type="button" className="btn btn-primary" onClick={onBackToLogin}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={send}>
      <h2 className="wizard-title">Forgot your password?</h2>
      <p className="form-hint">Enter your email and we'll send you a link to reset it.</p>
      <Field label="Email" htmlFor="forgot-email">
        <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <button type="button" className="link-button auth-link" onClick={onBackToLogin}>
        Back to log in
      </button>
    </form>
  );
}
