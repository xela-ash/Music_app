import { useState } from "react";
import * as demo from "../../demo/store";
import type { SubmissionFile, VerificationRecord } from "../../domain/marketplace";
import { formatDateTime } from "../../lib/format";
import { VERIFICATION_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Field, FileDrop } from "../../ui/controls";
import { Badge, Card, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice, SuccessBanner } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

const DOCUMENT_TYPES = ["Passport", "Driving licence", "National ID", "Voter ID"];

// P03–P07 on one route: the overview always shows the governed status, and the
// rest of the screen changes with it — submission form (not submitted /
// rejected / expired / revoked), processing (pending / under review), request
// for more information, or the result (approved).
export function VerificationScreen() {
  const nav = useNav();
  const record = useAsync(() => demo.getVerification(), "verification");
  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "profile" })} eyebrow="Identity" title="Identity verification" />
      <PreviewNotice>Verification runs on preview data, and wording follows the draft status vocabulary.</PreviewNotice>
      <Async state={record.state} onRetry={record.reload} loadingLabel="Loading verification…">
        {(v) => <Body record={v} reload={record.reload} onDone={() => nav.bumpBadges()} />}
      </Async>
    </div>
  );
}

function Body({ record: v, reload, onDone }: { record: VerificationRecord; reload: () => void; onDone: () => void }) {
  const label = VERIFICATION_STATUS[v.status];
  const canSubmit = ["not_submitted", "rejected", "expired", "revoked", "additional_information_required"].includes(v.status);
  return (
    <>
      <Card title="Status">
        <p>
          <Badge label={label} />
        </p>
        <p>{label.blurb}</p>
        {v.submitted_at ? <p className="muted">Submitted {formatDateTime(v.submitted_at)}</p> : null}
        {v.status === "additional_information_required" && v.reviewer_request ? (
          <p className="error-message" role="note">
            Reviewer request: {v.reviewer_request}
          </p>
        ) : null}
        {v.status === "rejected" && v.rejection_reason ? (
          <p className="error-message" role="note">
            Reason: {v.rejection_reason}
          </p>
        ) : null}
        {v.status === "pending" || v.status === "under_review" ? (
          <ol className="stepper" aria-label="Verification progress">
            <li className="stepper-step stepper-done">
              <span className="stepper-index">✓</span>Submitted
            </li>
            <li className={`stepper-step ${v.status === "under_review" ? "stepper-current" : ""}`}>
              <span className="stepper-index">2</span>Under review
            </li>
            <li className="stepper-step">
              <span className="stepper-index">3</span>Decision
            </li>
          </ol>
        ) : null}
        {v.status === "approved" ? <SuccessBanner>You're identity verified. Your profile shows a verification badge.</SuccessBanner> : null}
      </Card>
      {canSubmit ? <SubmissionForm additional={v.status === "additional_information_required"} onSubmitted={() => { reload(); onDone(); }} /> : null}
    </>
  );
}

// P04 / P06 — evidence, consent, submit.
function SubmissionForm({ additional, onSubmitted }: { additional: boolean; onSubmitted: () => void }) {
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);
  const [files, setFiles] = useState<SubmissionFile[]>([]);
  const [selfie, setSelfie] = useState<SubmissionFile[]>([]);
  const [consent, setConsent] = useState(false);
  const action = useAction();

  async function submit() {
    const ok = await action.run(() => demo.submitVerification({ document_type: docType, files: [...files, ...selfie], selfie: selfie.length > 0, consent }));
    if (ok) onSubmitted();
  }

  return (
    <Card title={additional ? "Provide the requested information" : "Submit your identity evidence"}>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Document type" htmlFor="ver-doc-type">
          <select id="ver-doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <FileDrop label="Document images" files={files} onChange={setFiles} disabled={action.submitting} hint="Clear photos of every page or side required." accept="image/*,.pdf" />
        <FileDrop label="Selfie holding your document (if requested)" files={selfie} onChange={setSelfie} disabled={action.submitting} accept="image/*" />
        <label className="checkbox-field">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I declare these documents are mine and consent to their review for identity verification.
        </label>
        <p className="form-hint">Your documents are private and never shown on your public profile.</p>
        <ActionErrorBanner error={action.error} />
        <button type="submit" className="btn btn-primary" disabled={action.submitting || !consent || files.length === 0}>
          {action.submitting ? "Submitting…" : additional ? "Provide information" : "Submit for verification"}
        </button>
      </form>
    </Card>
  );
}
