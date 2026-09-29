import { useState } from "react";
import type { HubProject } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { formatDate, formatMoney } from "../../lib/format";
import { HUB_STATUS } from "../../lib/labels";
import { Tabs } from "../../ui/controls";
import { Badge, PageHeader, ProgressBar } from "../../ui/display";
import { Async, EmptyState } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";
import { loadProjects } from "./loadProjects";
import { completedMilestones, counterparty, matchesFilter, myRole, nextAction, nextMilestone } from "./helpers";
import type { ProjectFilter } from "./helpers";

const TABS: Array<{ id: ProjectFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_action", label: "Needs action" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "closed", label: "Cancelled / refunded" },
];

export function ProjectsListScreen({
  session,
  onOpen,
  onDiscover,
}: {
  session: Session;
  onOpen: (p: HubProject) => void;
  onDiscover: () => void;
}) {
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const projects = useAsync(() => loadProjects(session), `projects-${session.user.id}`);

  return (
    <div className="projects-view">
      <PageHeader eyebrow="Projects" title="Your music projects" subtitle="Track collaborations where you are hiring talent or delivering creative work." />
      <Tabs tabs={TABS} active={filter} onChange={setFilter} label="Project filters" />
      <Async state={projects.state} onRetry={projects.reload} loadingLabel="Loading projects...">
        {(all) => {
          if (all.length === 0) {
            return (
              <EmptyState
                title="No projects yet."
                action={
                  <button type="button" className="btn btn-primary" onClick={onDiscover}>
                    Discover talent
                  </button>
                }
              >
                Start by discovering a collaborator and creating your first project.
              </EmptyState>
            );
          }
          const shown = all.filter((p) => matchesFilter(p, myRole(p, session.user.id), filter));
          if (shown.length === 0) return <EmptyState title="Nothing here.">No projects match this filter.</EmptyState>;
          return (
            <div className="project-grid">
              {shown.map((p) => (
                <ProjectCard key={p.id} project={p} userId={session.user.id} onOpen={onOpen} />
              ))}
            </div>
          );
        }}
      </Async>
    </div>
  );
}

export function ProjectCard({ project, userId, onOpen }: { project: HubProject; userId: string; onOpen: (p: HubProject) => void }) {
  const role = myRole(project, userId);
  const other = counterparty(project, userId);
  const next = nextMilestone(project);
  const action = nextAction(project, role);
  const done = completedMilestones(project);
  return (
    <div className="project-card">
      <div className="project-card-header">
        <p className="project-card-title">{project.title}</p>
        <Badge label={HUB_STATUS[project.status]} />
      </div>
      <p className="project-card-role">
        {role === "buyer" ? "You are the buyer" : "You are the seller"} · with {other.display_name} (@{other.handle})
        {project.origin === "preview" ? " · Preview" : ""}
      </p>
      <div className="project-card-terms">
        <span>{formatMoney(project.total, project.currency)}</span>
        <span>
          {project.milestones.length === 0 ? "Milestones not loaded" : `${done} of ${project.milestones.length} milestones completed`}
        </span>
      </div>
      {project.milestones.length > 0 ? (
        <>
          <ProgressBar value={done} max={project.milestones.length} label="Milestones completed" />
          <p className="project-card-date">
            Released {formatMoney(project.released, project.currency)} / {formatMoney(project.total, project.currency)}
          </p>
        </>
      ) : null}
      {next ? (
        <p className="project-card-date">
          Next: {next.title}
          {next.due_at ? ` · due ${formatDate(next.due_at)}` : ""}
        </p>
      ) : null}
      {action ? <p className={`next-action ${action.mine ? "next-action-mine" : ""}`}>{action.label}</p> : null}
      <button type="button" className="btn btn-secondary profile-card-action" onClick={() => onOpen(project)}>
        View project
      </button>
    </div>
  );
}
