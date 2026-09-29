import { useState } from "react";
import * as demo from "../../demo/store";
import type { DisputeCase, Role, SubmissionFile } from "../../domain/marketplace";
import { formatDateTime, formatMoney } from "../../lib/format";
import { DISPUTE_STATUS, describeOutcome } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { ConfirmDialog, Field, FileDrop } from "../../ui/controls";
import { Badge, Card, KeyValue, PageHeader, Timeline } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { FileList } from "../milestones/shared";

// DIS02 (case), DIS03 (respondent's response) and DIS04 (outcome) live on one
// screen because which one applies is decided by the case's status and the
// viewer's side.
export function DisputeCaseScreen({ disputeId }: { disputeId: string }) {
  const nav = useNav();
  const data = useAsync(() => demo.getDispute(disputeId), `dispute-${disputeId}`);
  return (
    <Async state={data.state} onRetry={data.reload} loadingLabel="Loading case…">
      {({ dispute, role }) => <Body dispute={dispute} role={role} reload={data.reload} onBack={() => nav.back({ name: "projects" })} />}
    </Async>
  );
}

function Body({ dispute: d, role, reload, onBack }: { dispute: DisputeCase; role: Role; reload: () => void; onBack: () => void }) {
  const nav = useNav();
  const [text, setText] = useState("");
  const [evidence, setEvidence] = useState<SubmissionFile[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const respond = useAction();
  const withdraw = useAction();
  const iAmRespondent = role !== d.claimant_role;
  const canRespond = iAmRespondent && d.status === "opened";
  const canWithdraw = !iAmRespondent && (d.status === "opened" || d.status === "under_review");

  async function submitResponse() {
    const ok = await respond.run(() => demo.respondToDispute(d.id, text, evidence));
    if (ok) reload();
  }

  async function doWithdraw() {
    const ok = await withdraw.run(() => demo.withdrawDispute(d.id));
    if (ok) {
      setConfirmWithdraw(false);
      nav.bumpBadges();
      reload();
    }
  }

  return (
    <div>
      <PageHeader
        onBack={onBack}
        eyebrow="Dispute case"
        title={d.project_title}
        subtitle={
          <>
            <Badge label={DISPUTE_STATUS[d.status]} /> · {d.category}
          </>
        }
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "project", projectId: d.project_id, tab: "overview" })}>
            Open project
          </button>
        }
      />
      <PreviewNotice>Disputes run on preview data.</PreviewNotice>

      <Card title="Case details">
        <KeyValue
          rows={[
            ["Claimant", `${d.claimant.display_name} (${d.claimant_role})`],
            ["Respondent", `${d.respondent.display_name} (${d.claimant_role === "buyer" ? "seller" : "buyer"})`],
            ["Scope", d.milestone_no === null ? "Whole project" : `Milestone ${d.milestone_no}`],
            ["Opened", formatDateTime(d.opened_at)],
            ["Response due", formatDateTime(d.response_deadline)],
            ["Reviewer", d.assigned_reviewer ?? "Not assigned yet"],
          ]}
        />
      </Card>

      <Card title="Claim">
        <p className="profile-detail-bio">{d.claim}</p>
        <FileList files={d.evidence} />
      </Card>

      {d.response ? (
        <Card title="Response">
          <p className="profile-detail-bio">{d.response.text}</p>
          <FileList files={d.response.evidence} />
          <p className="muted">Submitted {formatDateTime(d.response.at)}</p>
        </Card>
      ) : null}

      {d.decision ? (
        <Card title="Outcome">
          <p className="outcome-summary">{describeOutcome(d.decision.outcome, d.decision.release_amount, d.decision.refund_amount, (n) => formatMoney(n))}</p>
          <p className="profile-detail-bio">{d.decision.rationale}</p>
          <KeyValue
            rows={[
              ["Released to seller", formatMoney(d.decision.release_amount)],
              ["Refunded to buyer", formatMoney(d.decision.refund_amount)],
              ["Execution", d.decision.execution === "executed" ? "Completed" : d.decision.execution === "blocked" ? "Blocked — awaiting resolution" : "Pending"],
              ["Decided", formatDateTime(d.decision.at)],
            ]}
          />
        </Card>
      ) : null}

      {canRespond ? (
        <Card title="Your response">
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitResponse();
            }}
          >
            <Field label="Response" htmlFor="dsp-response">
              <textarea id="dsp-response" value={text} onChange={(e) => setText(e.target.value)} required />
            </Field>
            <FileDrop label="Evidence" files={evidence} onChange={setEvidence} disabled={respond.submitting} />
            <ActionErrorBanner error={respond.error} onReload={reload} />
            <button type="submit" className="btn btn-primary" disabled={respond.submitting}>
              {respond.submitting ? "Submitting…" : "Submit response"}
            </button>
          </form>
        </Card>
      ) : null}

      {canWithdraw ? (
        <div className="content-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmWithdraw(true)}>
            Withdraw dispute
          </button>
        </div>
      ) : null}
      <ActionErrorBanner error={withdraw.error} onReload={reload} />

      <Card title="Timeline">
        <Timeline items={[...d.timeline].map((e) => ({ id: e.id, at: e.at, title: e.text }))} />
      </Card>

      {confirmWithdraw ? (
        <ConfirmDialog title="Withdraw this dispute?" confirmLabel="Withdraw dispute" danger busy={withdraw.submitting} onConfirm={doWithdraw} onCancel={() => setConfirmWithdraw(false)}>
          The project returns to its previous state. You can't reopen a withdrawn case.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
