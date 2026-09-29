import { useState } from "react";
import * as demo from "../../demo/store";
import type { HubMilestone, HubProject } from "../../domain/marketplace";
import { formatMoney } from "../../lib/format";
import { useNav } from "../../nav/context";
import { ConfirmDialog, Field } from "../../ui/controls";
import { Card, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice, SuccessBanner } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { SubmissionCard, SubmissionHistory } from "./shared";

// M05 — the buyer reviews the exact submission version against the
// requirements. M06 — requesting a revision asks for the reason.
// M08 — approving shows the release result.
export function ReviewDeliverableScreen({ projectId, milestoneId }: { projectId: string; milestoneId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `review-${projectId}-${milestoneId}`);
  return (
    <Async state={project.state} onRetry={project.reload} loadingLabel="Loading submission…">
      {(p) => {
        const m = p.milestones.find((x) => x.id === milestoneId);
        if (!m) return <p className="section-subcopy">That milestone couldn't be found.</p>;
        return <Body project={p} milestone={m} reload={project.reload} onBack={() => nav.back({ name: "milestone", projectId, milestoneId })} />;
      }}
    </Async>
  );
}

function Body({ project: p, milestone: m, reload, onBack }: { project: HubProject; milestone: HubMilestone; reload: () => void; onBack: () => void }) {
  const nav = useNav();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<"approved" | "revision" | null>(null);
  const action = useAction();
  const latest = m.submissions[m.submissions.length - 1];
  const used = demo.revisionsUsed(m);
  const remaining = Math.max(m.revision_allowance - used, 0);
  const reviewable = m.status === "delivered" && latest?.decision === "pending";

  async function approve() {
    const ok = await action.run(() => demo.approveSubmission(p.id, m.id, p.version));
    if (ok) {
      setConfirmApprove(false);
      setResult("approved");
      nav.bumpBadges();
    }
  }

  async function revise() {
    const ok = await action.run(() => demo.requestRevision(p.id, m.id, reason, p.version));
    if (ok) {
      setRequesting(false);
      setResult("revision");
      nav.bumpBadges();
    }
  }

  if (result === "approved") {
    return (
      <div>
        <PageHeader eyebrow={`Milestone ${m.milestone_no}`} title="Milestone approved" />
        <Card>
          <SuccessBanner>Approved submission v{latest?.version}. {formatMoney(m.amount, p.currency)} is being released to the seller.</SuccessBanner>
          <p className="form-hint">Rating the seller is separate and never holds up the release.</p>
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={() => nav.replace({ name: "project", projectId: p.id, tab: "milestones" })}>
              Back to project
            </button>
          </div>
        </Card>
      </div>
    );
  }
  if (result === "revision") {
    return (
      <div>
        <PageHeader eyebrow={`Milestone ${m.milestone_no}`} title="Revision requested" />
        <Card>
          <SuccessBanner>The milestone is back with the seller. They can submit a new version.</SuccessBanner>
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={() => nav.replace({ name: "milestone", projectId: p.id, milestoneId: m.id })}>
              Back to milestone
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader onBack={onBack} eyebrow={`Milestone ${m.milestone_no} · ${p.title}`} title={`Review: ${m.title}`} subtitle={`${formatMoney(m.amount, p.currency)} · ${remaining} revision${remaining === 1 ? "" : "s"} remaining`} />
      {p.origin === "preview" ? <PreviewNotice>Review and release run on preview data.</PreviewNotice> : null}
      <Card title="Requirements">
        <p>{m.description ?? "No description."}</p>
        <p className="muted">Submission requirements: {m.submission_requirements ?? "Not specified."}</p>
      </Card>
      {latest ? (
        <Card title={`Submission v${latest.version} (under review)`}>
          <SubmissionCard sub={latest} />
        </Card>
      ) : (
        <p className="section-subcopy">Nothing has been submitted yet.</p>
      )}
      <Card title="Revision history">
        <p className="muted">
          {used} of {m.revision_allowance} revisions used.
        </p>
        <SubmissionHistory milestone={m} />
      </Card>
      <ActionErrorBanner error={action.error} onReload={reload} />
      {reviewable ? (
        <div className="content-actions">
          <button type="button" className="btn btn-primary" onClick={() => setConfirmApprove(true)} disabled={action.submitting}>
            Approve
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setRequesting(true)} disabled={action.submitting || remaining === 0}>
            Request revision
          </button>
          {remaining === 0 ? <span className="muted">No revisions remain — approve, or open a dispute from the project.</span> : null}
        </div>
      ) : (
        <p className="section-subcopy">There's nothing waiting for your review on this milestone.</p>
      )}

      {confirmApprove ? (
        <ConfirmDialog title="Approve this submission?" confirmLabel="Approve and release" busy={action.submitting} onConfirm={approve} onCancel={() => setConfirmApprove(false)}>
          Approving releases {formatMoney(m.amount, p.currency)} to the seller. This can't be undone.
        </ConfirmDialog>
      ) : null}

      {requesting ? (
        <ConfirmDialog title="Request a revision" confirmLabel="Request revision" busy={action.submitting} onConfirm={revise} onCancel={() => setRequesting(false)}>
          <p>You're reviewing submission v{latest?.version}. Tell the seller exactly what to change.</p>
          <Field label="Requested changes" htmlFor="rv-reason">
            <textarea id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
