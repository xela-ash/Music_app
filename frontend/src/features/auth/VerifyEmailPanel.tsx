import { useState } from "react";
import type { FormEvent } from "react";
import type { EmailVerificationStatus } from "../../domain/marketplace";
import { maskEmail } from "../../lib/format";
import { EMAIL_VERIFICATION_STATUS } from "../../lib/labels";
import { Badge } from "../../ui/display";
import { PreviewNotice } from "../../ui/feedback";

const PREVIEW_STATES: EmailVerificationStatus[] = ["pending", "sent", "expired", "verified", "error"];

// Presentational: used by the sign-up wizard (local state) and by
// Settings → Account (store-backed). Email verification isn't implemented on
// the backend yet; the preview control lets every state be seen.
export function VerifyEmailPanel({
  email,
  status,
  busy,
  error,
  onResend,
  onChangeEmail,
  onSimulate,
}: {
  email: string | null;
  status: EmailVerificationStatus;
  busy: boolean;
  error: string;
  onResend: () => void;
  onChangeEmail: (address: string) => void;
  onSimulate: (status: EmailVerificationStatus) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [draft, setDraft] = useState("");

  function submitChange(e: FormEvent) {
    e.preventDefault();
    onChangeEmail(draft);
    setChanging(false);
    setDraft("");
  }

  if (!email) {
    return <p className="form-hint">No email address on this account. Add one to verify it.</p>;
  }

  return (
    <div className="verify-email">
      <p>
        <Badge label={EMAIL_VERIFICATION_STATUS[status]} />
      </p>
      {status === "verified" ? (
        <p className="success-message success-inline">{email} is verified.</p>
      ) : status === "expired" ? (
        <p className="error-message">That verification link has expired. Send a new one to {maskEmail(email)}.</p>
      ) : status === "error" ? (
        <p className="error-message">We couldn't verify that link. Try sending a new one.</p>
      ) : (
        <p>
          We sent a verification link to <strong>{maskEmail(email)}</strong>. Open it to confirm your address. Commercial activity
          stays restricted until your email is verified.
        </p>
      )}
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}

      {status !== "verified" ? (
        <div className="content-actions">
          <button type="button" className="btn btn-primary" onClick={onResend} disabled={busy}>
            {busy ? "Sending…" : status === "pending" ? "Send verification email" : "Resend"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setChanging((c) => !c)} disabled={busy}>
            Change email
          </button>
        </div>
      ) : null}

      {changing ? (
        <form className="auth-form" onSubmit={submitChange}>
          <div className="form-field">
            <label htmlFor="verify-new-email">New email address</label>
            <input id="verify-new-email" type="email" value={draft} onChange={(e) => setDraft(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Send to this address
          </button>
        </form>
      ) : null}

      <PreviewNotice>Email delivery isn't connected yet. Use this control to preview each state.</PreviewNotice>
      <div className="form-field">
        <label htmlFor="verify-preview-state">Preview state</label>
        <select id="verify-preview-state" value={status} onChange={(e) => onSimulate(e.target.value as EmailVerificationStatus)}>
          {PREVIEW_STATES.map((s) => (
            <option key={s} value={s}>
              {EMAIL_VERIFICATION_STATUS[s].text}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
