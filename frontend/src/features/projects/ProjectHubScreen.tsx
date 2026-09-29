import * as demo from "../../demo/store";
import type { HubMilestone, HubProject } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { formatDate, formatMoney } from "../../lib/format";
import { HUB_STATUS, MILESTONE_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import type { ProjectTab } from "../../nav/routes";
import { Tabs } from "../../ui/controls";
import { Badge, Card, PageHeader, ProgressBar, Stat } from "../../ui/display";
import { Async, PreviewNotice } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";
import { ConversationView } from "../messages/ConversationView";
import { ActivityTab, FilesTab } from "./FilesActivityTabs";
import { completedMilestones, counterparty, myRole, nextAction } from "./helpers";
import { LiveDraftPanel } from "./LiveDraftPanel";
import { MilestonesTable } from "./MilestonesTable";
import { TermsTab } from "./TermsTab";

const TABS: Array<{ id: ProjectTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "milestones", label: "Milestones" },
  { id: "messages", label: "Messages" },
  { id: "files", label: "Files / deliverables" },
  { id: "activity", label: "Activity" },
  { id: "terms", label: "Terms" },
];

// PR07 — the project hub: financial summary, milestone summary and the six
// project tabs. Actions shown depend on role and state, for usability only;
// the backend remains the authority.
export function ProjectHubScreen({ session, projectId, tab }: { session: Session; projectId: string; tab: ProjectTab }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `project-${projectId}`);

  function setTab(next: ProjectTab) {
    nav.replace({ name: "project", projectId, tab: next });
  }

  return (
    <Async state={project.state} onRetry={project.reload} loadingLabel="Loading project…">
      {(p) => (
        <HubBody
          project={p}
          session={session}
          tab={tab}
          setTab={setTab}
          reload={project.reload}
        />
      )}
    </Async>
  );
}

function HubBody({
  project: p,
  session,
  tab,
  setTab,
  reload,
}: {
  project: HubProject;
  session: Session;
  tab: ProjectTab;
  setTab: (t: ProjectTab) => void;
  reload: () => void;
}) {
  const nav = useNav();
  const userId = session.user.id;
  const role = myRole(p, userId);
  const other = counterparty(p, userId);
  const done = completedMilestones(p);
  const action = nextAction(p, role);
  const eligibility = demo.disputeEligibility(p);
  const pendingAmendment = p.amendments.find((a) => a.status === "pending");
  const openMilestone = (m: HubMilestone) => nav.go({ name: "milestone", projectId: p.id, milestoneId: m.id });
  const holding = p.funded - p.released - p.refunded;

  return (
    <div className="project-detail">
      <PageHeader
        onBack={() => nav.back({ name: "projects" })}
        backLabel="Back"
        eyebrow={role === "buyer" ? "Project · you are the buyer" : "Project · you are the seller"}
        title={p.title}
        subtitle={
          <>
            {p.buyer.display_name} (buyer) · {p.seller.display_name} (seller) · started {formatDate(p.created_at)} · delivery {p.delivery_days} days
          </>
        }
        actions={
          <>
            <Badge label={HUB_STATUS[p.status]} />
            {role === "buyer" && p.status === "awaiting_funding" ? (
              <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "funding", projectId: p.id })}>
                Fund project
              </button>
            ) : null}
            {role === "seller" && p.status === "proposal_sent" ? (
              <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "proposal", projectId: p.id })}>
                Review proposal
              </button>
            ) : null}
          </>
        }
      />

      {p.origin === "preview" ? <PreviewNotice>Milestones, funding, messages and reviews for this project run on preview data.</PreviewNotice> : null}

      {action ? (
        <p className={`next-action ${action.mine ? "next-action-mine" : ""}`} role="status">
          {action.mine ? "Your turn: " : "Next: "}
          {action.label}
        </p>
      ) : null}

      {pendingAmendment && pendingAmendment.proposed_by_user_id !== userId ? (
        <Card title="Amendment waiting for your response">
          <p>{other.display_name} proposed changes to the agreed terms.</p>
          <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "reviewAmendment", projectId: p.id, amendmentId: pendingAmendment.id })}>
            Review amendment
          </button>
        </Card>
      ) : null}

      {p.origin === "live" && p.status === "draft" ? (
        <LiveDraftPanel project={p} isBuyer={role === "buyer"} onChanged={reload} />
      ) : null}

      <Tabs tabs={TABS} active={tab} onChange={setTab} label="Project sections" />

      {tab === "overview" ? (
        <div className="hub-overview">
          <div className="stat-row">
            <Stat label="Total agreed" value={formatMoney(p.total, p.currency)} />
            <Stat label="Funded" value={formatMoney(p.funded, p.currency)} />
            <Stat label="Released" value={formatMoney(p.released, p.currency)} />
            <Stat label="Refunded" value={formatMoney(p.refunded, p.currency)} />
            <Stat label="Held / remaining" value={formatMoney(Math.max(holding, 0), p.currency)} />
          </div>

          <Card title="Milestones">
            {p.milestones.length === 0 ? (
              <p className="section-subcopy">Milestone details aren't available for this project yet.</p>
            ) : (
              <>
                <p>
                  {done} of {p.milestones.length} complete
                </p>
                <ProgressBar value={done} max={p.milestones.length} label="Milestones complete" />
                <ul className="milestone-cards">
                  {p.milestones.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="milestone-card" onClick={() => openMilestone(m)}>
                        <span className="milestone-card-no">Milestone {m.milestone_no}</span>
                        <span className="milestone-card-title">{m.title}</span>
                        <span className="milestone-card-amount">{formatMoney(m.amount, p.currency)}</span>
                        <Badge label={MILESTONE_STATUS[m.status]} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Brief">
            <p className="profile-detail-bio">{p.brief}</p>
          </Card>

          <div className="content-actions">
            {p.status === "active" || p.status === "awaiting_funding" ? (
              <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "amend", projectId: p.id })}>
                Propose amendment
              </button>
            ) : null}
            {eligibility.allowed ? (
              <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "openDispute", projectId: p.id, milestoneNo: null })}>
                Open dispute
              </button>
            ) : null}
            {p.dispute_id ? (
              <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "dispute", disputeId: p.dispute_id as string })}>
                View dispute
              </button>
            ) : null}
            {(role === "buyer" ? p.ratings_open.buyer_can_rate : p.ratings_open.seller_can_rate) ? (
              <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "rate", projectId: p.id })}>
                Rate {other.display_name}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "milestones" ? <MilestonesTable project={p} onOpen={openMilestone} /> : null}
      {tab === "messages" ? <ConversationView projectId={p.id} session={session} embedded /> : null}
      {tab === "files" ? <FilesTab project={p} /> : null}
      {tab === "activity" ? <ActivityTab project={p} /> : null}
      {tab === "terms" ? <TermsTab project={p} userId={userId} onOpenAmendment={(id) => nav.go({ name: "reviewAmendment", projectId: p.id, amendmentId: id })} /> : null}

      <div className="hub-refresh">
        <button type="button" className="link-button" onClick={reload}>
          Refresh
        </button>
      </div>
    </div>
  );
}
