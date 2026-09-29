import type { HubProject } from "../../domain/marketplace";
import { formatDate, formatMoney } from "../../lib/format";
import { MILESTONE_STATUS, MONEY_STATUS } from "../../lib/labels";
import { Badge, ProgressBar } from "../../ui/display";
import { EmptyState } from "../../ui/feedback";
import { completedMilestones } from "./helpers";
import type { HubMilestone } from "../../domain/marketplace";

// M01 — all milestones together, with progress and where the money is.
export function MilestonesTable({ project: p, onOpen }: { project: HubProject; onOpen: (m: HubMilestone) => void }) {
  if (p.milestones.length === 0) {
    return <EmptyState title="No milestones to show.">Milestone details aren't available for this project yet.</EmptyState>;
  }
  const done = completedMilestones(p);
  return (
    <div>
      <p className="milestones-summary">
        <strong>
          {done} / {p.milestones.length} completed
        </strong>{" "}
        · {formatMoney(p.released, p.currency)} / {formatMoney(p.total, p.currency)} released
      </p>
      <ProgressBar value={done} max={p.milestones.length} label="Milestones completed" />
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Milestone</th>
              <th scope="col">Amount</th>
              <th scope="col">Due</th>
              <th scope="col">Revisions</th>
              <th scope="col">Status</th>
              <th scope="col">Money</th>
            </tr>
          </thead>
          <tbody>
            {p.milestones.map((m) => {
              const used = m.submissions.filter((s) => s.decision === "revision_requested").length;
              return (
                <tr key={m.id}>
                  <td>{m.milestone_no}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpen(m)}>
                      {m.title}
                    </button>
                  </td>
                  <td>{formatMoney(m.amount, p.currency)}</td>
                  <td>{formatDate(m.due_at, "No due date")}</td>
                  <td>
                    {used} / {m.revision_allowance}
                  </td>
                  <td>
                    <Badge label={MILESTONE_STATUS[m.status]} />
                  </td>
                  <td>{MONEY_STATUS[m.money]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
