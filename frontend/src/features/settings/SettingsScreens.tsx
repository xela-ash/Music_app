import { useState } from "react";
import type { FormEvent } from "react";
import * as demo from "../../demo/store";
import { VerifyEmailPanel } from "../auth/VerifyEmailPanel";
import type { Session } from "../../domain/types";
import { formatDate, getErrorMessage } from "../../lib/format";
import { VERIFICATION_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Field } from "../../ui/controls";
import { Badge, Card, KeyValue, PageHeader } from "../../ui/display";
import { Async, PreviewNotice, SuccessBanner } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

// S01
export function SettingsHubScreen() {
  const nav = useNav();
  const sections: Array<{ title: string; blurb: string; go: () => void }> = [
    { title: "Account", blurb: "Email, phone and account status", go: () => nav.go({ name: "settingsAccount" }) },
    { title: "Security", blurb: "Password, sessions and sign-in protection", go: () => nav.go({ name: "settingsSecurity" }) },
    { title: "Notifications", blurb: "Choose how you hear about activity", go: () => nav.go({ name: "notificationSettings" }) },
    { title: "Privacy / profile", blurb: "Edit what other people see", go: () => nav.go({ name: "editProfile" }) },
    { title: "Payments / payouts", blurb: "Payout readiness, earnings and transactions", go: () => nav.go({ name: "payouts" }) },
  ];
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings" />
      <ul className="settings-list">
        {sections.map((s) => (
          <li key={s.title}>
            <button type="button" className="settings-row" onClick={s.go}>
              <span className="settings-row-title">{s.title}</span>
              <span className="muted">{s.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// S02 — account. Email verification state and the identity status are shown
// because they gate commercial activity.
export function AccountSettingsScreen({ session }: { session: Session }) {
  const nav = useNav();
  const email = useAsync(() => demo.getEmailVerification(), "account-email");
  const verification = useAsync(() => demo.getVerification(), "account-verification");
  const action = useAction();
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneNote, setPhoneNote] = useState("");

  async function resend() {
    const r = await action.run(() => demo.resendEmailVerification());
    if (r) email.setData(r);
  }
  async function change(address: string) {
    const r = await action.run(() => demo.changeEmailAddress(address));
    if (r) email.setData(r);
  }
  async function simulate(status: Parameters<typeof demo.simulateEmailState>[0]) {
    const r = await action.run(() => demo.simulateEmailState(status));
    if (r) email.setData(r);
  }

  function submitPhone(e: FormEvent) {
    e.preventDefault();
    if (!/^\+[1-9]\d{6,14}$/.test(phoneDraft.trim())) return setPhoneNote("Phone must be in international format, e.g. +919876543210.");
    setPhoneNote("Phone changes aren't connected yet, so nothing was saved.");
  }

  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "settings" })} eyebrow="Settings" title="Account" />
      <Card title="Account details">
        <KeyValue
          rows={[
            ["Email", session.user.email ?? "Not set"],
            ["Phone", session.user.phone_e164 ?? "Not set"],
            ["Account status", session.user.status === "active" ? "Active" : session.user.status === "suspended" ? "Suspended" : "Deleted"],
            ["Member since", formatDate(session.user.created_at)],
          ]}
        />
        <Async state={verification.state}>
          {(v) => (
            <p>
              Identity verification: <Badge label={VERIFICATION_STATUS[v.status]} />
            </p>
          )}
        </Async>
      </Card>
      <Card title="Email verification">
        <PreviewNotice>Email changes and verification aren't connected to the backend yet.</PreviewNotice>
        <Async state={email.state} onRetry={email.reload}>
          {(e) => <VerifyEmailPanel email={e.address} status={e.status} busy={action.submitting} error={action.error?.message ?? ""} onResend={resend} onChangeEmail={change} onSimulate={simulate} />}
        </Async>
      </Card>
      <Card title="Change phone">
        <form className="auth-form" onSubmit={submitPhone}>
          <Field label="New phone number (E.164)" htmlFor="acct-phone">
            <input id="acct-phone" type="tel" placeholder="+919876543210" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} />
          </Field>
          {phoneNote ? <p className="form-hint" role="status">{phoneNote}</p> : null}
          <button type="submit" className="btn btn-secondary">
            Change phone
          </button>
        </form>
      </Card>
    </div>
  );
}

// S03 — security. Password change is a preview stub; sessions and MFA are
// planned, not part of the current MVP.
export function SecuritySettingsScreen() {
  const nav = useNav();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    try {
      if (next !== confirm) throw new Error("Passwords do not match.");
      if (next.length < 8) throw new Error("Password must be at least 8 characters.");
      if (new TextEncoder().encode(next).length > 72) throw new Error("Password must not exceed 72 bytes.");
      setError("");
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "settings" })} eyebrow="Settings" title="Security" />
      <Card title="Change password">
        <PreviewNotice>There's no change-password API yet, so this validates but doesn't change your password.</PreviewNotice>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Current password" htmlFor="sec-current">
            <input id="sec-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="sec-new" hint="At least 8 characters.">
            <input id="sec-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label="Confirm new password" htmlFor="sec-confirm">
            <input id="sec-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}
          {done ? <SuccessBanner>Password checks passed (preview — not saved).</SuccessBanner> : null}
          <button type="submit" className="btn btn-primary">
            Change password
          </button>
        </form>
      </Card>
      <Card title="Sessions">
        <p className="section-subcopy">Managing signed-in devices is planned for a later release.</p>
      </Card>
      <Card title="Multi-factor authentication">
        <p className="section-subcopy">MFA is planned for a later release and isn't required to use MusicApp today.</p>
      </Card>
    </div>
  );
}
