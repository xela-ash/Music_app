import type { HubMilestone, HubProject, Submission } from "../../domain/marketplace";
import { formatBytes, formatDateTime, formatMoney } from "../../lib/format";
import { Badge, KeyValue, Timeline } from "../../ui/display";
import { MONEY_STATUS } from "../../lib/labels";

export function FileList({ files }: { files: Submission["files"] }) {
  if (files.length === 0) return <p className="muted">No files.</p>;
  return (
    <ul className="file-list">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="file-list-item">
          <span>
            {f.name} <span className="muted">({formatBytes(f.size_bytes)})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SubmissionCard({ sub }: { sub: Submission }) {
  const tone = sub.decision === "approved" ? "success" : sub.decision === "revision_requested" ? "warn" : "info";
  const text = sub.decision === "approved" ? "Approved" : sub.decision === "revision_requested" ? "Revision requested" : "Awaiting review";
  return (
    <article className="submission-card">
      <header className="submission-card-head">
        <h3 className="section-heading section-heading-small">Submission v{sub.version}</h3>
        <Badge label={{ text, tone }} />
        {sub.late ? <Badge label={{ text: "Late", tone: "danger" }} /> : null}
      </header>
      <p className="muted">Submitted {formatDateTime(sub.submitted_at)}</p>
      <FileList files={sub.files} />
      {sub.note ? <p className="submission-note">“{sub.note}”</p> : null}
      {sub.revision_reason ? <p className="submission-revision">Requested changes: {sub.revision_reason}</p> : null}
    </article>
  );
}

// M07 — every submission and decision in order. Nothing is ever overwritten.
export function SubmissionHistory({ milestone }: { milestone: HubMilestone }) {
  const items: Array<{ id: string; at: string; title: string; detail?: string }> = [];
  milestone.submissions.forEach((s) => {
    items.push({ id: `${s.id}-sub`, at: s.submitted_at, title: `Submission v${s.version}`, detail: s.note ?? undefined });
    if (s.decision === "revision_requested" && s.decision_at) {
      items.push({ id: `${s.id}-rev`, at: s.decision_at, title: "Revision requested", detail: s.revision_reason ?? undefined });
    }
    if (s.decision === "approved" && s.decision_at) {
      items.push({ id: `${s.id}-ok`, at: s.decision_at, title: "Approved" });
    }
  });
  if (items.length === 0) return <p className="section-subcopy">No submissions yet.</p>;
  return <Timeline items={items.map((i) => ({ id: i.id, at: i.at, title: i.title, detail: i.detail }))} />;
}

export function FinancialStatus({ project, milestone }: { project: HubProject; milestone: HubMilestone }) {
  const released = milestone.money === "released" ? milestone.amount : 0;
  const refunded = milestone.money === "refunded" ? milestone.amount : 0;
  const held = milestone.money === "held" || milestone.money === "escrow" ? milestone.amount : 0;
  return (
    <KeyValue
      rows={[
        ["Allocated", formatMoney(milestone.amount, project.currency)],
        ["Held", formatMoney(held, project.currency)],
        ["Released", formatMoney(released, project.currency)],
        ["Refunded", formatMoney(refunded, project.currency)],
        ["Money status", MONEY_STATUS[milestone.money]],
      ]}
    />
  );
}
