import { useState } from "react";
import * as demo from "../../demo/store";
import type { HubProject } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { formatDate, formatMoney } from "../../lib/format";
import { HUB_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { ConfirmDialog } from "../../ui/controls";
import { Badge, Card, KeyValue, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice, SuccessBanner } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { myRole } from "./helpers";

// PR05 — the seller reviews the whole proposal before responding.
// PR06 — declining asks for confirmation only; no reason is captured because
// no product policy defines one.
export function ProposalScreen({ session, projectId }: { session: Session; projectId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `proposal-${projectId}`);
  return (
    <Async state={project.state} onRetry={project.reload} loadingLabel="Loading proposal…">
      {(p) => <ProposalBody project={p} session={session} reload={project.reload} onBack={() => nav.back({ name: "projects" })} />}
    </Async>
  );
}

function ProposalBody({ project: p, session, reload, onBack }: { project: HubProject; session: Session; reload: () => void; onBack: () => void }) {
  const nav = useNav();
  const role = myRole(p, session.user.id);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [message, setMessage] = useState("");
  const action = useAction();
  const terms = p.terms[p.terms.length - 1];

  async function respond(decision: "accept" | "decline") {
    const result = await action.run(() => demo.respondToProposal(p.id, decision, p.version));
    if (!result) return;
    setConfirmingDecline(false);
    if (decision === "accept") {
      setMessage("You accepted this proposal. The buyer can now fund the project.");
      nav.bumpBadges();
      nav.replace({ name: "project", projectId: p.id, tab: "overview" });
    } else {
      setMessage("You declined this proposal.");
      reload();
    }
  }

  const canRespond = role === "seller" && p.status === "proposal_sent";

  return (
    <div>
      <PageHeader
        onBack={onBack}
        eyebrow="Proposal"
        title={p.title}
        subtitle={
          <>
            From {p.buyer.display_name} (@{p.buyer.handle}) · <Badge label={HUB_STATUS[p.status]} />
          </>
        }
      />
      {p.origin === "live" ? (
        <PreviewNotice>
          This proposal exists on the live backend, but the API can't list a seller's pending invitations yet, so it can't be accepted or declined from here.
        </PreviewNotice>
      ) : null}
      {message ? <SuccessBanner>{message}</SuccessBanner> : null}

      <Card title="Commercial terms">
        <KeyValue
          rows={[
            ["Total", formatMoney(terms.total, terms.currency)],
            ["Currency", terms.currency],
            ["Timeline", `${terms.delivery_days} days from acceptance`],
            ["Revision obligation", `${terms.revision_limit} revision${terms.revision_limit === 1 ? "" : "s"} overall`],
          ]}
        />
      </Card>
      <Card title="Requirements">
        <p className="profile-detail-bio">{terms.brief}</p>
      </Card>
      <Card title="Milestones">
        <ol className="terms-milestones">
          {terms.milestones.map((m) => (
            <li key={m.milestone_no}>
              <strong>
                {m.milestone_no}. {m.title}
              </strong>{" "}
              — {formatMoney(m.amount, terms.currency)} · {m.due_at ? `due ${formatDate(m.due_at)}` : "no due date"}
              {m.description ? <span className="muted"> · {m.description}</span> : null}
            </li>
          ))}
        </ol>
        <p className="milestones-summary">Total {formatMoney(terms.total, terms.currency)}</p>
      </Card>

      <ActionErrorBanner error={action.error} onReload={reload} />
      {canRespond && p.origin === "preview" ? (
        <div className="content-actions">
          <button type="button" className="btn btn-primary" onClick={() => respond("accept")} disabled={action.submitting}>
            {action.submitting ? "Working…" : "Accept proposal"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDecline(true)} disabled={action.submitting}>
            Decline
          </button>
        </div>
      ) : null}
      {!canRespond ? <p className="section-subcopy">{role === "buyer" ? "Waiting for the seller to respond." : "This proposal is no longer open."}</p> : null}

      {confirmingDecline ? (
        <ConfirmDialog title="Decline this proposal?" confirmLabel="Decline proposal" danger busy={action.submitting} onConfirm={() => respond("decline")} onCancel={() => setConfirmingDecline(false)}>
          The buyer will be told you declined. You can't undo this.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
