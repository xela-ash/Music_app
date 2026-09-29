import type { HubProject, TermsVersion } from "../../domain/marketplace";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { Badge, Card, KeyValue } from "../../ui/display";
import type { Label } from "../../lib/labels";

const AMENDMENT_LABEL: Record<string, Label> = {
  pending: { text: "Pending", tone: "warn" },
  accepted: { text: "Accepted", tone: "success" },
  rejected: { text: "Rejected", tone: "danger" },
  withdrawn: { text: "Withdrawn", tone: "neutral" },
  expired: { text: "Expired", tone: "neutral" },
  superseded: { text: "Superseded", tone: "neutral" },
};

function TermsCard({ terms, current }: { terms: TermsVersion; current: boolean }) {
  return (
    <Card title={current ? `Current terms — version ${terms.version}` : `Version ${terms.version}`}>
      <KeyValue
        rows={[
          ["Total", formatMoney(terms.total, terms.currency)],
          ["Currency", terms.currency],
          ["Delivery", `${terms.delivery_days} days`],
          ["Revision limit", String(terms.revision_limit)],
          ["Accepted by", terms.accepted_by ?? "Not yet accepted"],
          ["Accepted on", formatDateTime(terms.accepted_at, "—")],
        ]}
      />
      <h3 className="section-heading section-heading-small">Brief</h3>
      <p className="profile-detail-bio">{terms.brief}</p>
      <h3 className="section-heading section-heading-small">Milestones</h3>
      <ol className="terms-milestones">
        {terms.milestones.map((m) => (
          <li key={m.milestone_no}>
            <strong>{m.title}</strong> — {formatMoney(m.amount, terms.currency)} · {m.due_at ? `due ${formatDate(m.due_at)}` : "no due date"} · {m.revision_allowance} revision
            {m.revision_allowance === 1 ? "" : "s"}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// PR08 — the agreed, versioned terms snapshot. Earlier versions stay readable.
export function TermsTab({ project: p, userId, onOpenAmendment }: { project: HubProject; userId: string; onOpenAmendment: (id: string) => void }) {
  const current = p.terms[p.terms.length - 1];
  const previous = p.terms.slice(0, -1).reverse();
  return (
    <div>
      {current ? <TermsCard terms={current} current /> : <p className="section-subcopy">No terms recorded yet.</p>}
      {previous.length ? (
        <>
          <h2 className="section-heading">Previous versions</h2>
          {previous.map((t) => (
            <TermsCard key={t.version} terms={t} current={false} />
          ))}
        </>
      ) : null}
      {p.amendments.length ? (
        <Card title="Amendments">
          <ul className="plain-list">
            {p.amendments.map((a) => (
              <li key={a.id} className="plain-list-item">
                <span>
                  Proposed {formatDateTime(a.proposed_at)} by {a.proposed_by_user_id === userId ? "you" : "the other party"} · {a.changes.length} change{a.changes.length === 1 ? "" : "s"}
                </span>
                <Badge label={AMENDMENT_LABEL[a.status]} />
                {a.status === "pending" ? (
                  <button type="button" className="link-button" onClick={() => onOpenAmendment(a.id)}>
                    Open
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
