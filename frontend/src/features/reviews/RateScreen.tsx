import { useState } from "react";
import * as demo from "../../demo/store";
import type { RatingDue } from "../../domain/marketplace";
import { useNav } from "../../nav/context";
import { Field, RatingInput } from "../../ui/controls";
import { Card, PageHeader, RatingValue } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice, SuccessBanner } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

// R01 (rating required) → R02 (confirm) → submitted. Rating content is
// immutable once submitted, so the confirmation says so before it's sent.
export function RateScreen({ projectId }: { projectId: string }) {
  const nav = useNav();
  const due = useAsync(() => demo.getRatingDue(projectId), `rate-${projectId}`);
  return (
    <Async state={due.state} onRetry={due.reload} loadingLabel="Loading…">
      {(d) => <RateForm due={d} onBack={() => nav.back({ name: "project", projectId, tab: "overview" })} />}
    </Async>
  );
}

function RateForm({ due, onBack }: { due: RatingDue; onBack: () => void }) {
  const nav = useNav();
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [validation, setValidation] = useState("");
  const action = useAction();
  const roleText = due.role_rated === "seller" ? "seller" : "buyer";

  function review() {
    if (score === null) return setValidation("Choose a rating.");
    setValidation("");
    setStep("confirm");
  }

  async function submit() {
    if (score === null) return;
    const ok = await action.run(() => demo.submitRating(due.project_id, score, text));
    if (ok) {
      setStep("done");
      nav.bumpBadges();
    }
  }

  if (step === "done") {
    return (
      <div>
        <PageHeader eyebrow="Rating" title="Thanks for your rating" />
        <SuccessBanner>Your rating of {due.counterparty.display_name} has been submitted.</SuccessBanner>
        <button type="button" className="btn btn-primary" onClick={() => nav.replace({ name: "reviews" })}>
          See my reviews
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader onBack={step === "confirm" ? () => setStep("form") : onBack} eyebrow="Rating" title={`Rate ${due.counterparty.display_name}`} subtitle={`${due.project_title} · you're rating them as the ${roleText}`} />
      <PreviewNotice>Ratings run on preview data. The rating scale is still to be decided, so the control adapts to whatever scale is configured.</PreviewNotice>
      {step === "form" ? (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <div className="form-field">
            <span className="field-label" id="rate-score-label">
              Rating
            </span>
            <RatingInput value={score} onChange={setScore} label="Rating" />
          </div>
          <Field label="Review (optional)" htmlFor="rate-text">
            <textarea id="rate-text" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {validation ? (
            <p className="error-message" role="alert">
              {validation}
            </p>
          ) : null}
          <div className="content-actions">
            <button type="submit" className="btn btn-primary">
              Continue
            </button>
          </div>
        </form>
      ) : (
        <Card title="Confirm your review">
          <p>
            Rating: <RatingValue score={score} /> for {due.counterparty.display_name}
          </p>
          <p className="profile-detail-bio">{text.trim() || "No written review."}</p>
          <p className="error-message" role="note">
            Your rating cannot be edited after submission.
          </p>
          <ActionErrorBanner error={action.error} />
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={action.submitting}>
              {action.submitting ? "Submitting…" : "Submit"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setStep("form")} disabled={action.submitting}>
              Back
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
