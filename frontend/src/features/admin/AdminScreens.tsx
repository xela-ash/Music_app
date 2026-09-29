import { useState } from "react";
import * as demo from "../../demo/store";
import type { DisputeOutcome, ModerationReview, VerificationQueueItem, VerificationStatus } from "../../domain/marketplace";
import { formatDate, formatDateTime, formatMoney, formatRelative, parseMoneyToMinorUnits } from "../../lib/format";
import { DISPUTE_STATUS, VERIFICATION_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Tabs, Field } from "../../ui/controls";
import { Badge, Card, KeyValue, PageHeader, Timeline, RatingValue } from "../../ui/display";
import { ActionErrorBanner, Async, EmptyState, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { FileList, SubmissionHistory } from "../milestones/shared";
import { SubmissionCard } from "../milestones/shared";

const FILTERS: Array<{ id: "all" | VerificationStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "under_review", label: "Under review" },
  { id: "additional_information_required", label: "Additional info" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

// ADM01
export function AdminVerificationQueue() {
  const nav = useNav();
  const [filter, setFilter] = useState<"all" | VerificationStatus>("all");
  const queue = useAsync(() => demo.adminVerificationQueue(), `adm-vq-${nav.badgeVersion}`);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Verification queue" />
      <PreviewNotice>Operations screens run on preview data and have no role check behind them yet.</PreviewNotice>
      <Tabs tabs={FILTERS} active={filter} onChange={setFilter} label="Verification filters" />
      <Async state={queue.state} onRetry={queue.reload}>
        {(items) => {
          const shown = items.filter((i) => filter === "all" || i.status === filter);
          if (shown.length === 0) return <EmptyState title="Nothing in this view." />;
          return (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Applicant</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Status</th>
                    <th scope="col">Age</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.applicant} <span className="muted">@{i.handle}</span>
                      </td>
                      <td>{formatDate(i.submitted_at)}</td>
                      <td>
                        <Badge label={VERIFICATION_STATUS[i.status]} />
                      </td>
                      <td>{formatRelative(i.submitted_at).replace(" ago", "")}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => nav.go({ name: "adminVerification", itemId: i.id })}>
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>
    </div>
  );
}

// ADM02
export function AdminVerificationReview({ itemId }: { itemId: string }) {
  const nav = useNav();
  const item = useAsync(() => demo.adminVerificationItem(itemId), `adm-vr-${itemId}`);
  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "adminVerificationQueue" })} eyebrow="Operations" title="Verification review" />
      <Async state={item.state} onRetry={item.reload}>
        {(i) => <ReviewBody item={i} reload={item.reload} />}
      </Async>
    </div>
  );
}

function ReviewBody({ item: i, reload }: { item: VerificationQueueItem; reload: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction();
  const decidable = ["pending", "under_review", "additional_information_required"].includes(i.status);

  async function decide(d: "approve" | "reject" | "request_info") {
    const ok = await action.run(() => demo.adminDecideVerification(i.id, d, note));
    if (ok) {
      setNote("");
      reload();
    }
  }

  return (
    <>
      <Card title="Applicant (private identity)">
        <KeyValue rows={[["Legal name", i.legal_name], ["Public handle", `@${i.handle}`], ["Document type", i.document_type], ["Status", <Badge key="s" label={VERIFICATION_STATUS[i.status]} />]]} />
      </Card>
      <Card title="Submitted evidence">
        <FileList files={i.documents} />
        <p className="muted">{i.has_selfie ? "Selfie / identity evidence included." : "No selfie included."}</p>
      </Card>
      <Card title="History">
        <Timeline items={i.history.map((h) => ({ id: h.id, at: h.at, title: h.text }))} />
      </Card>
      {decidable ? (
        <Card title="Decision">
          <Field label="Note to applicant (required to reject or request more information)" htmlFor="adm-note">
            <textarea id="adm-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ActionErrorBanner error={action.error} />
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={() => decide("approve")} disabled={action.submitting}>
              Approve
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => decide("request_info")} disabled={action.submitting}>
              Request additional information
            </button>
            <button type="button" className="btn btn-danger" onClick={() => decide("reject")} disabled={action.submitting}>
              Reject
            </button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

// ADM03
export function AdminDisputeQueue() {
  const nav = useNav();
  const rows = useAsync(() => demo.adminDisputeQueue(), `adm-dq-${nav.badgeVersion}`);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Dispute queue" />
      <PreviewNotice>Operations screens run on preview data and have no role check behind them yet.</PreviewNotice>
      <Async state={rows.state} onRetry={rows.reload}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="No disputes." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Case</th>
                    <th scope="col">Milestone</th>
                    <th scope="col">Buyer</th>
                    <th scope="col">Seller</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">Deadline</th>
                    <th scope="col">Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button type="button" className="link-button" onClick={() => nav.go({ name: "adminDispute", disputeId: r.id })}>
                          {r.project_title}
                        </button>
                      </td>
                      <td>{r.milestone_no ?? "All"}</td>
                      <td>{r.buyer}</td>
                      <td>{r.seller}</td>
                      <td>{r.category}</td>
                      <td>
                        <Badge label={DISPUTE_STATUS[r.status]} />
                      </td>
                      <td>{formatDate(r.deadline)}</td>
                      <td>{r.assigned_reviewer ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Async>
    </div>
  );
}

// ADM04 — everything a reviewer needs in one workspace, then the decision.
export function AdminDisputeAdjudication({ disputeId }: { disputeId: string }) {
  const nav = useNav();
  const ws = useAsync(() => demo.adminDisputeWorkspace(disputeId), `adm-dw-${disputeId}`);
  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "adminDisputes" })} eyebrow="Operations" title="Dispute adjudication" />
      <Async state={ws.state} onRetry={ws.reload} loadingLabel="Loading case workspace…">
        {({ dispute: d, project: p, messages, attempts }) => {
          const milestone = d.milestone_no !== null ? p.milestones.find((m) => m.milestone_no === d.milestone_no) : undefined;
          const amount = milestone ? milestone.amount : p.total - p.released;
          return (
            <>
              <Card title="Project terms">
                <KeyValue rows={[["Project", p.title], ["Total", formatMoney(p.total, p.currency)], ["Brief", p.brief], ["Revisions", String(p.revision_limit)]]} />
              </Card>
              <Card title={milestone ? `Milestone ${milestone.milestone_no} terms` : "Milestone terms"}>
                {milestone ? (
                  <>
                    <p>
                      {milestone.title} — {formatMoney(milestone.amount, p.currency)} · requirements: {milestone.submission_requirements ?? "—"}
                    </p>
                    <h3 className="section-heading section-heading-small">Submission and revision history</h3>
                    <SubmissionHistory milestone={milestone} />
                    {milestone.submissions.map((s) => (
                      <SubmissionCard key={s.id} sub={s} />
                    ))}
                  </>
                ) : (
                  <p className="section-subcopy">The whole project is in dispute.</p>
                )}
              </Card>
              <Card title="Statements and evidence">
                <h3 className="section-heading section-heading-small">Claimant ({d.claimant.display_name})</h3>
                <p>{d.claim}</p>
                <FileList files={d.evidence} />
                <h3 className="section-heading section-heading-small">Respondent ({d.respondent.display_name})</h3>
                {d.response ? (
                  <>
                    <p>{d.response.text}</p>
                    <FileList files={d.response.evidence} />
                  </>
                ) : (
                  <p className="muted">No response yet.</p>
                )}
              </Card>
              <Card title="Messages">
                <ul className="plain-list">
                  {messages.map((m) => (
                    <li key={m.id} className="plain-list-item">
                      <span>
                        {m.kind === "system" ? "System" : m.sender_user_id === d.claimant.user_id ? d.claimant.display_name : d.respondent.display_name}: {m.body}
                        {m.deleted ? " (deleted by sender — retained for review)" : ""}
                      </span>
                      <span className="muted">{formatDateTime(m.at)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Escrow / payment facts">
                <KeyValue rows={[["Funded", formatMoney(p.funded, p.currency)], ["Released", formatMoney(p.released, p.currency)], ["Refunded", formatMoney(p.refunded, p.currency)], ["Payment attempts", String(attempts.length)], ["Amount in dispute", formatMoney(amount, p.currency)]]} />
              </Card>
              <DecisionForm key={d.id + d.status} disputeId={d.id} amount={amount} decided={d.decision !== null} onDecided={() => { ws.reload(); nav.bumpBadges(); }} />
            </>
          );
        }}
      </Async>
    </div>
  );
}

const OUTCOMES: Array<{ id: DisputeOutcome; label: string }> = [
  { id: "AWARD_BUYER", label: "Award buyer" },
  { id: "AWARD_SELLER", label: "Award seller" },
  { id: "SPLIT", label: "Split" },
  { id: "DISMISS", label: "Dismiss" },
];

function DecisionForm({ disputeId, amount, decided, onDecided }: { disputeId: string; amount: number; decided: boolean; onDecided: () => void }) {
  const [outcome, setOutcome] = useState<DisputeOutcome>("AWARD_SELLER");
  const [release, setRelease] = useState("");
  const [refund, setRefund] = useState("");
  const [rationale, setRationale] = useState("");
  const [validation, setValidation] = useState("");
  const action = useAction();

  if (decided) return <p className="section-subcopy">A decision has been issued for this case.</p>;

  async function submit() {
    setValidation("");
    let rel = 0;
    let ref = 0;
    if (outcome === "SPLIT") {
      const r = parseMoneyToMinorUnits(release || "0.00");
      const f = parseMoneyToMinorUnits(refund || "0.00");
      // A zero side is legal for a split only via the other outcomes, so both parse as >0 here.
      if (r === null || f === null) return setValidation("Enter an exact release amount and refund amount.");
      if (r + f !== amount) return setValidation(`Release and refund must add up to exactly ${formatMoney(amount)}.`);
      rel = r;
      ref = f;
    }
    const ok = await action.run(() => demo.adminDecideDispute(disputeId, outcome, rel, ref, rationale));
    if (ok) onDecided();
  }

  return (
    <Card title="Decision">
      <div className="form-field">
        <span className="field-label">Outcome</span>
        <div className="chip-row" role="radiogroup" aria-label="Outcome">
          {OUTCOMES.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={outcome === o.id} className={`chip ${outcome === o.id ? "chip-active" : ""}`} onClick={() => setOutcome(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {outcome === "SPLIT" ? (
        <div className="milestone-form-row-fields">
          <Field label="Release to seller (INR)" htmlFor="adm-release">
            <input id="adm-release" inputMode="decimal" value={release} onChange={(e) => setRelease(e.target.value)} />
          </Field>
          <Field label="Refund to buyer (INR)" htmlFor="adm-refund" hint={`Must total ${formatMoney(amount)}.`}>
            <input id="adm-refund" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} />
          </Field>
        </div>
      ) : null}
      <Field label="Rationale (shown to both parties as permitted)" htmlFor="adm-rationale">
        <textarea id="adm-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
      </Field>
      {validation ? (
        <p className="error-message" role="alert">
          {validation}
        </p>
      ) : null}
      <ActionErrorBanner error={action.error} />
      <button type="button" className="btn btn-primary" onClick={submit} disabled={action.submitting}>
        {action.submitting ? "Recording…" : "Issue decision"}
      </button>
    </Card>
  );
}

// ADM05 — moderation changes visibility only. Score and text can't be edited.
export function AdminReviewModeration() {
  const nav = useNav();
  const list = useAsync(() => demo.adminReviews(), `adm-rv-${nav.badgeVersion}`);
  const action = useAction();

  async function moderate(r: ModerationReview, a: "hide" | "remove" | "reinstate") {
    const ok = await action.run(() => demo.adminModerateReview(r.id, a));
    if (ok) list.reload();
  }

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Review moderation" subtitle="Hide, remove or reinstate a review. The score and text can never be rewritten." />
      <PreviewNotice>Operations screens run on preview data and have no role check behind them yet.</PreviewNotice>
      <ActionErrorBanner error={action.error} />
      <Async state={list.state} onRetry={list.reload}>
        {(items) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Score</th>
                  <th scope="col">Review</th>
                  <th scope="col">Rater → ratee</th>
                  <th scope="col">Project</th>
                  <th scope="col">Case</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <RatingValue score={r.score} />
                    </td>
                    <td>{r.text}</td>
                    <td>
                      @{r.rater.handle} → @{r.ratee.handle}
                    </td>
                    <td>{r.project_title}</td>
                    <td>{r.evidence_case ?? "—"}</td>
                    <td>{r.status === "PUBLISHED" ? "Published" : r.status === "HIDDEN" ? "Hidden" : "Removed"}</td>
                    <td className="row-actions">
                      {r.status === "PUBLISHED" ? (
                        <>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => moderate(r, "hide")} disabled={action.submitting}>
                            Hide
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => moderate(r, "remove")} disabled={action.submitting}>
                            Remove
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => moderate(r, "reinstate")} disabled={action.submitting}>
                          Reinstate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </div>
  );
}
