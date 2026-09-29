import * as demo from "../../demo/store";
import type { HubMilestone, HubProject } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { formatDate, formatMoney, isPast } from "../../lib/format";
import { MILESTONE_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Badge, Card, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { myRole } from "../projects/helpers";
import { FinancialStatus, SubmissionCard, SubmissionHistory } from "./shared";

// M02 — the milestone workroom. Shows requirements, money, the full
// submission history (M04/M07) and the one action this role can take now.
export function MilestoneWorkroom({ session, projectId, milestoneId }: { session: Session; projectId: string; milestoneId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `milestone-${projectId}-${milestoneId}`);
  return (
    <Async state={project.state} onRetry={project.reload} loadingLabel="Loading milestone…">
      {(p) => {
        const m = p.milestones.find((x) => x.id === milestoneId);
        if (!m) return <p className="section-subcopy">That milestone couldn't be found.</p>;
        return <Body project={p} milestone={m} session={session} reload={project.reload} onBack={() => nav.back({ name: "project", projectId, tab: "milestones" })} />;
      }}
    </Async>
  );
}

function Body({ project: p, milestone: m, session, reload, onBack }: { project: HubProject; milestone: HubMilestone; session: Session; reload: () => void; onBack: () => void }) {
  const nav = useNav();
  const role = myRole(p, session.user.id);
  const start = useAction();
  const used = demo.revisionsUsed(m);
  const latest = m.submissions[m.submissions.length - 1];

  async function startWork() {
    const result = await start.run(() => demo.startMilestone(p.id, m.id, p.version));
    if (result) reload();
  }

  const isSellerTurn = role === "seller" && (m.status === "in_progress" || m.status === "revision_requested");
  const isBuyerTurn = role === "buyer" && m.status === "delivered";
  const canStart = role === "seller" && m.status === "planned" && p.status === "active";
  const overdue = isPast(m.due_at) && ["planned", "in_progress", "revision_requested"].includes(m.status);

  return (
    <div>
      <PageHeader
        onBack={onBack}
        eyebrow={`Milestone ${m.milestone_no} · ${p.title}`}
        title={m.title}
        subtitle={
          <>
            <Badge label={MILESTONE_STATUS[m.status]} /> · {formatMoney(m.amount, p.currency)} · due {formatDate(m.due_at, "no due date")}
            {overdue ? " · overdue" : ""} · {used} of {m.revision_allowance} revisions used
          </>
        }
        actions={
          <>
            {isSellerTurn ? (
              <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "submitWork", projectId: p.id, milestoneId: m.id })}>
                {m.status === "revision_requested" ? "Submit revised work" : "Submit work"}
              </button>
            ) : null}
            {isBuyerTurn ? (
              <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "reviewDeliverable", projectId: p.id, milestoneId: m.id })}>
                Review submission
              </button>
            ) : null}
            {canStart ? (
              <button type="button" className="btn btn-primary" onClick={startWork} disabled={start.submitting}>
                {start.submitting ? "Starting…" : "Start milestone"}
              </button>
            ) : null}
          </>
        }
      />
      {p.origin === "preview" ? <PreviewNotice>Milestone workflow runs on preview data.</PreviewNotice> : null}
      <ActionErrorBanner error={start.error} onReload={reload} />

      {m.status === "released" ? (
        <Card title="Approved and released">
          <p className="success-message success-inline">
            {formatMoney(m.amount, p.currency)} was released. Approved submission: v{m.submissions.filter((s) => s.decision === "approved").slice(-1)[0]?.version ?? "—"}.
          </p>
          <p className="form-hint">Ratings never delay a release.</p>
        </Card>
      ) : null}

      <Card title="Requirements">
        <p>{m.description ?? "No description."}</p>
        <p className="muted">Submission requirements: {m.submission_requirements ?? "Not specified."}</p>
      </Card>
      <Card title="Financial status">
        <FinancialStatus project={p} milestone={m} />
      </Card>
      <Card title="Submissions">
        {m.submissions.length === 0 ? (
          <p className="section-subcopy">No work has been submitted yet.</p>
        ) : (
          <div className="submission-stack">
            {[...m.submissions].reverse().map((s) => (
              <SubmissionCard key={s.id} sub={s} />
            ))}
          </div>
        )}
      </Card>
      <Card title="Submission & revision history">
        <SubmissionHistory milestone={m} />
      </Card>
      {latest && m.status === "delivered" && role === "seller" ? <p className="section-subcopy">Waiting for the buyer to review v{latest.version}.</p> : null}
    </div>
  );
}
