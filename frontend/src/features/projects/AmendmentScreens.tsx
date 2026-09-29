import { useState } from "react";
import type { FormEvent } from "react";
import * as demo from "../../demo/store";
import type { Amendment, HubProject } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { formatDateTime, formatMoney, parseMoneyToMinorUnits, parseNonNegativeIntegerOrDefault, parsePositiveInteger } from "../../lib/format";
import { useNav } from "../../nav/context";
import { Field } from "../../ui/controls";
import { Badge, Card, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import type { Label } from "../../lib/labels";

// PR09 — propose changes to accepted terms. The form always shows current →
// proposed so nobody agrees to a silent overwrite.
export function AmendScreen({ projectId }: { projectId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `amend-${projectId}`);
  return (
    <Async state={project.state} onRetry={project.reload}>
      {(p) => <AmendForm project={p} onBack={() => nav.back({ name: "project", projectId, tab: "terms" })} />}
    </Async>
  );
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function AmendForm({ project: p, onBack }: { project: HubProject; onBack: () => void }) {
  const nav = useNav();
  const current = p.terms[p.terms.length - 1];
  const [brief, setBrief] = useState(current.brief);
  const [days, setDays] = useState(String(current.delivery_days));
  const [revisions, setRevisions] = useState(String(current.revision_limit));
  const [rows, setRows] = useState(
    current.milestones.map((m) => ({ no: m.milestone_no, title: m.title, amount: String(m.amount / 100), due: toDateInput(m.due_at), originalDueAt: m.due_at, allowance: String(m.revision_allowance) }))
  );
  const [validation, setValidation] = useState("");
  const action = useAction();

  const proposedTotal = rows.reduce((s, r) => s + (parseMoneyToMinorUnits(r.amount) ?? 0), 0);
  const delta = proposedTotal - current.total;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setValidation("");
    const d = parsePositiveInteger(days);
    const rev = parseNonNegativeIntegerOrDefault(revisions);
    if (d === null) return setValidation("Delivery days must be a whole number greater than 0.");
    if (rev === null) return setValidation("Revision limit must be 0 or more.");
    const milestones: demo.AmendmentInput["milestones"] = [];
    for (const r of rows) {
      const amount = parseMoneyToMinorUnits(r.amount);
      const allowance = parseNonNegativeIntegerOrDefault(r.allowance);
      if (!r.title.trim() || amount === null || allowance === null) return setValidation(`Check milestone ${r.no}: title, amount and revisions are required.`);
      milestones.push({ milestone_no: r.no, title: r.title.trim(), amount, // Keep the exact original timestamp unless the date itself was edited.
        due_at: r.due === toDateInput(r.originalDueAt) ? r.originalDueAt : r.due ? new Date(`${r.due}T00:00:00.000Z`).toISOString() : null, revision_allowance: allowance });
    }
    const result = await action.run(() => demo.proposeAmendment(p.id, { brief, delivery_days: d, revision_limit: rev, milestones }, p.version));
    if (result) nav.replace({ name: "project", projectId: p.id, tab: "terms" });
  }

  return (
    <div>
      <PageHeader onBack={onBack} eyebrow="Amendment" title="Propose an amendment" subtitle={`Changes to ${p.title} need the other party's agreement. The current terms stay in force until then.`} />
      <PreviewNotice>Amendments run on preview data. How an amount change is funded or refunded is defined by Payments and isn't applied here.</PreviewNotice>
      <form className="auth-form create-project-form" onSubmit={submit}>
        <Field label="Project brief" htmlFor="am-brief" hint="Currently shown below the field.">
          <textarea id="am-brief" value={brief} onChange={(e) => setBrief(e.target.value)} />
        </Field>
        <div className="milestone-form-row-fields">
          <Field label={`Delivery days (now ${current.delivery_days})`} htmlFor="am-days">
            <input id="am-days" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label={`Revision limit (now ${current.revision_limit})`} htmlFor="am-rev">
            <input id="am-rev" type="number" min="0" value={revisions} onChange={(e) => setRevisions(e.target.value)} />
          </Field>
        </div>
        {rows.map((r, i) => {
          const live = p.milestones.find((m) => m.milestone_no === r.no);
          const locked = live ? live.status !== "planned" : false;
          const old = current.milestones[i];
          return (
            <div className="milestone-form-row" key={r.no}>
              <div className="milestone-form-row-header">
                <span className="milestone-form-number">Milestone {r.no}</span>
                {locked ? <span className="muted">Already started — scope and amount are fixed</span> : null}
              </div>
              <Field label="Title" htmlFor={`am-title-${r.no}`}>
                <input id={`am-title-${r.no}`} value={r.title} disabled={locked} onChange={(e) => setRows((rs) => rs.map((x) => (x.no === r.no ? { ...x, title: e.target.value } : x)))} />
              </Field>
              <div className="milestone-form-row-fields">
                <Field label={`Amount, INR (now ${formatMoney(old.amount, current.currency)})`} htmlFor={`am-amt-${r.no}`}>
                  <input id={`am-amt-${r.no}`} inputMode="decimal" value={r.amount} disabled={locked} onChange={(e) => setRows((rs) => rs.map((x) => (x.no === r.no ? { ...x, amount: e.target.value } : x)))} />
                </Field>
                <Field label="Due date" htmlFor={`am-due-${r.no}`}>
                  <input id={`am-due-${r.no}`} type="date" value={r.due} onChange={(e) => setRows((rs) => rs.map((x) => (x.no === r.no ? { ...x, due: e.target.value } : x)))} />
                </Field>
                <Field label="Revisions" htmlFor={`am-allow-${r.no}`}>
                  <input id={`am-allow-${r.no}`} type="number" min="0" value={r.allowance} onChange={(e) => setRows((rs) => rs.map((x) => (x.no === r.no ? { ...x, allowance: e.target.value } : x)))} />
                </Field>
              </div>
            </div>
          );
        })}
        <div className="milestone-summary">
          <div className="milestone-summary-row">
            <span>Current total</span>
            <span>{formatMoney(current.total, current.currency)}</span>
          </div>
          <div className="milestone-summary-row">
            <span>Proposed total</span>
            <span>{formatMoney(proposedTotal, current.currency)}</span>
          </div>
          <div className="milestone-summary-row milestone-summary-remaining">
            <span>Financial change</span>
            <span>
              {delta > 0 ? "+" : delta < 0 ? "-" : ""}
              {formatMoney(Math.abs(delta), current.currency)}
            </span>
          </div>
        </div>
        {validation ? (
          <p className="error-message" role="alert">
            {validation}
          </p>
        ) : null}
        <ActionErrorBanner error={action.error} />
        <div className="content-actions">
          <button className="btn btn-primary" type="submit" disabled={action.submitting}>
            {action.submitting ? "Sending…" : "Send amendment"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={action.submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const STATUS: Record<Amendment["status"], Label> = {
  pending: { text: "Pending", tone: "warn" },
  accepted: { text: "Accepted", tone: "success" },
  rejected: { text: "Rejected", tone: "danger" },
  withdrawn: { text: "Withdrawn", tone: "neutral" },
  expired: { text: "Expired", tone: "neutral" },
  superseded: { text: "Superseded", tone: "neutral" },
};

// PR10 — the counterparty sees a diff: old terms, new terms, money delta,
// affected milestones and when the offer expires.
export function ReviewAmendmentScreen({ session, projectId, amendmentId }: { session: Session; projectId: string; amendmentId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `review-amendment-${projectId}-${amendmentId}`);
  return (
    <Async state={project.state} onRetry={project.reload}>
      {(p) => {
        const a = p.amendments.find((x) => x.id === amendmentId);
        if (!a) return <p className="section-subcopy">That amendment couldn't be found.</p>;
        return <AmendmentBody project={p} amendment={a} session={session} reload={project.reload} onBack={() => nav.back({ name: "project", projectId, tab: "terms" })} />;
      }}
    </Async>
  );
}

function AmendmentBody({ project: p, amendment: a, session, reload, onBack }: { project: HubProject; amendment: Amendment; session: Session; reload: () => void; onBack: () => void }) {
  const nav = useNav();
  const action = useAction();
  const mine = a.proposed_by_user_id === session.user.id;

  async function respond(decision: "accept" | "reject" | "withdraw") {
    const result = await action.run(() => demo.respondToAmendment(p.id, a.id, decision, p.version));
    if (result) {
      nav.bumpBadges();
      nav.replace({ name: "project", projectId: p.id, tab: "terms" });
    }
  }

  return (
    <div>
      <PageHeader onBack={onBack} eyebrow="Amendment" title={mine ? "Your amendment" : "Review amendment"} subtitle={<>{p.title} · <Badge label={STATUS[a.status]} /></>} />
      <Card title="What changes">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Term</th>
              <th scope="col">Current</th>
              <th scope="col">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {a.changes.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}</th>
                <td>{c.from}</td>
                <td>{c.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Impact">
        <p>
          Financial change: <strong>{a.financial_delta > 0 ? "+" : a.financial_delta < 0 ? "-" : ""}{formatMoney(Math.abs(a.financial_delta), p.currency)}</strong>
        </p>
        <p>Affected milestones: {a.affected_milestones.length ? a.affected_milestones.join(", ") : "none"}</p>
        <p>Expires {formatDateTime(a.expires_at)}</p>
      </Card>
      <ActionErrorBanner error={action.error} onReload={reload} />
      {a.status === "pending" ? (
        <div className="content-actions">
          {mine ? (
            <button type="button" className="btn btn-secondary" onClick={() => respond("withdraw")} disabled={action.submitting}>
              Withdraw amendment
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => respond("accept")} disabled={action.submitting}>
                Accept
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => respond("reject")} disabled={action.submitting}>
                Reject
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="section-subcopy">This amendment is {STATUS[a.status].text.toLowerCase()}.</p>
      )}
    </div>
  );
}
