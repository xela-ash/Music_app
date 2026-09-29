import { useState } from "react";
import * as demo from "../../demo/store";
import type { HubProject, PaymentAttempt } from "../../domain/marketplace";
import { formatMoney } from "../../lib/format";
import { PAYMENT_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Badge, Card, KeyValue, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

// PAY01 → PAY02 → PAY03/PAY04. The whole agreed amount is funded up front.
// The payment step is a provider-neutral container: no provider has been
// selected, so it only models the lifecycle (created → action required →
// processing → succeeded / failed / cancelled). A retry always makes a new
// attempt rather than rewriting the failed one.
export function FundingScreen({ projectId }: { projectId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `funding-${projectId}`);
  return (
    <Async state={project.state} onRetry={project.reload} loadingLabel="Loading…">
      {(p) => <FundingBody project={p} onBack={() => nav.back({ name: "project", projectId, tab: "overview" })} />}
    </Async>
  );
}

function FundingBody({ project: p, onBack }: { project: HubProject; onBack: () => void }) {
  const nav = useNav();
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const action = useAction();

  async function start() {
    const created = await action.run(() => demo.createPaymentAttempt(p.id, p.version));
    if (created) setAttempt(created);
  }

  async function step(kind: "continue" | demo.SimulatedProviderResult) {
    if (!attempt) return;
    const next = await action.run(() => demo.advancePayment(attempt.id, kind));
    if (next) {
      setAttempt(next);
      if (next.status === "succeeded") nav.bumpBadges();
    }
  }

  const finished = attempt && ["succeeded", "failed", "cancelled"].includes(attempt.status);

  if (p.status !== "awaiting_funding" && !(attempt && attempt.status === "succeeded")) {
    return (
      <div>
        <PageHeader onBack={onBack} eyebrow="Funding" title="Nothing to fund" />
        <p className="section-subcopy">This project isn't waiting for funding.</p>
      </div>
    );
  }

  if (attempt?.status === "succeeded") {
    return (
      <div>
        <PageHeader eyebrow="Funding" title="Funding successful" />
        <Card>
          <p className="success-message success-inline">Your project is funded and work can begin.</p>
          <KeyValue
            rows={[
              ["Project", p.title],
              ["Amount", formatMoney(attempt.amount, attempt.currency)],
              ["Reference", attempt.reference],
              ["Funding status", "Funded"],
            ]}
          />
          <button type="button" className="btn btn-primary" onClick={() => nav.replace({ name: "project", projectId: p.id, tab: "overview" })}>
            Go to project
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader onBack={onBack} eyebrow="Funding" title={attempt ? "Complete payment" : "Fund this project"} subtitle={p.title} />
      <PreviewNotice>No payment provider is connected. The buttons below simulate the provider's steps so each state can be reviewed.</PreviewNotice>

      {!attempt ? (
        <>
          <Card title="What you're funding">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Milestone</th>
                  <th scope="col">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {p.milestones.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.milestone_no}. {m.title}
                    </td>
                    <td>{formatMoney(m.amount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <KeyValue
              rows={[
                ["Project total", formatMoney(p.total, p.currency)],
                ["Currency", p.currency],
                ["Platform / provider charges", "None defined yet"],
                ["Total payable", formatMoney(p.total, p.currency)],
              ]}
            />
            <p className="form-hint">The full agreed amount is held in escrow up front and released milestone by milestone as you approve work.</p>
          </Card>
          <ActionErrorBanner error={action.error} />
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={start} disabled={action.submitting}>
              {action.submitting ? "Starting…" : "Fund project"}
            </button>
          </div>
        </>
      ) : (
        <Card title={`Payment attempt ${attempt.attempt_no}`}>
          <p>
            <Badge label={PAYMENT_STATUS[attempt.status]} />
          </p>
          <KeyValue rows={[["Amount", formatMoney(attempt.amount, attempt.currency)], ["Reference", attempt.reference]]} />
          {attempt.status === "failed" ? (
            <>
              <p className="error-message" role="alert">
                Payment failed. {attempt.failure_reason}
              </p>
              <div className="content-actions">
                <button type="button" className="btn btn-primary" onClick={start} disabled={action.submitting}>
                  Try again
                </button>
                <button type="button" className="btn btn-secondary" onClick={onBack}>
                  Back to project
                </button>
              </div>
              <p className="form-hint">Trying again starts a new payment attempt.</p>
            </>
          ) : attempt.status === "cancelled" ? (
            <div className="content-actions">
              <button type="button" className="btn btn-primary" onClick={start} disabled={action.submitting}>
                Start a new attempt
              </button>
              <button type="button" className="btn btn-secondary" onClick={onBack}>
                Back to project
              </button>
            </div>
          ) : (
            <>
              <p className="section-subcopy">
                {attempt.status === "created"
                  ? "Continue to your payment provider to authorise the payment."
                  : attempt.status === "action_required"
                    ? "Your provider needs you to complete an authentication step (redirect, OTP or 3-D Secure)."
                    : "Your payment is being processed."}
              </p>
              <ActionErrorBanner error={action.error} />
              {!finished ? (
                <div className="content-actions">
                  {attempt.status !== "processing" ? (
                    <button type="button" className="btn btn-primary" onClick={() => step("continue")} disabled={action.submitting}>
                      {attempt.status === "created" ? "Continue to provider" : "Complete authentication"}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => step("succeed")} disabled={action.submitting}>
                      Simulate success
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => step("fail")} disabled={action.submitting}>
                    Simulate failure
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => step("cancel")} disabled={action.submitting}>
                    Cancel payment
                  </button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
