import * as demo from "../../demo/store";
import { PAYOUT_ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Badge, Card, PageHeader, Stepper } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

const ONBOARDING_STEPS = ["Not started", "Onboarding", "Review", "Ready"];
const ORDER = ["not_started", "onboarding", "pending_review", "ready"];

// PAY05 (readiness) + PAY06 (payout account setup). No payout provider has
// been selected, so there are deliberately no bank-account fields here: the
// setup area is a provider-neutral shell that shows onboarding status and
// hands off to whatever the provider requires.
export function PayoutsScreen() {
  const nav = useNav();
  const readiness = useAsync(() => demo.getPayoutReadiness(), "payout-readiness");
  const action = useAction();

  async function advance() {
    const status = await action.run(() => demo.advancePayoutOnboarding());
    if (status) readiness.reload();
  }

  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "profile" })} eyebrow="Payments" title="Payout readiness" subtitle="To receive money for finished milestones you need a verified identity and a payout account." />
      <PreviewNotice>Payout provider isn't selected yet. This shows the flow without collecting any account details.</PreviewNotice>
      <Async state={readiness.state} onRetry={readiness.reload}>
        {(r) => {
          const idx = Math.max(ORDER.indexOf(r.payout_account === "action_required" ? "not_started" : r.payout_account), 0);
          return (
            <>
              <Card title="Requirements">
                <ul className="check-list">
                  <li>
                    <span>
                      {r.identity === "approved" ? "✓" : "○"} Identity verification <Badge label={VERIFICATION_STATUS[r.identity]} />
                    </span>
                    {r.identity !== "approved" ? (
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => nav.go({ name: "verification" })}>
                        Verify identity
                      </button>
                    ) : null}
                  </li>
                  <li>
                    <span>
                      {r.payout_account === "ready" ? "✓" : "○"} Payout account <Badge label={PAYOUT_ACCOUNT_STATUS[r.payout_account]} />
                    </span>
                  </li>
                </ul>
                <p className={r.eligible ? "success-message success-inline" : "form-hint"}>
                  {r.eligible ? "You're eligible for payouts." : "Complete both requirements to become eligible for payouts."}
                </p>
              </Card>
              <Card title="Payout account setup">
                <Stepper steps={ONBOARDING_STEPS} current={idx} />
                <p className="section-subcopy">
                  {r.payout_account === "ready"
                    ? "Your payout account is ready."
                    : r.payout_account === "pending_review"
                      ? "Your provider is reviewing your details."
                      : r.payout_account === "onboarding"
                        ? "Continue onboarding with the payout provider to finish setup."
                        : "Set up a payout account to receive released funds."}
                </p>
                <ActionErrorBanner error={action.error} />
                {r.payout_account !== "ready" ? (
                  <button type="button" className="btn btn-primary" onClick={advance} disabled={action.submitting}>
                    {r.payout_account === "not_started" || r.payout_account === "action_required" ? "Set up payout" : "Simulate provider progress"}
                  </button>
                ) : null}
              </Card>
              <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "earnings" })}>
                View earnings
              </button>
            </>
          );
        }}
      </Async>
    </div>
  );
}
