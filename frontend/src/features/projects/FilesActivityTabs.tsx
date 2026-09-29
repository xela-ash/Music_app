import type { HubProject } from "../../domain/marketplace";
import { formatBytes, formatDateTime } from "../../lib/format";
import { Timeline } from "../../ui/display";
import { EmptyState } from "../../ui/feedback";

export function FilesTab({ project: p }: { project: HubProject }) {
  if (p.files.length === 0) {
    return <EmptyState title="No deliverables yet.">Files appear here as work is submitted against milestones.</EmptyState>;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Milestone</th>
            <th scope="col">Submission</th>
            <th scope="col">Size</th>
            <th scope="col">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {p.files.map((f, i) => (
            <tr key={`${f.name}-${f.submission_version}-${i}`}>
              <td>{f.name}</td>
              <td>{f.milestone_no}</td>
              <td>v{f.submission_version}</td>
              <td>{formatBytes(f.size_bytes)}</td>
              <td>{formatDateTime(f.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityTab({ project: p }: { project: HubProject }) {
  if (p.activity.length === 0) return <EmptyState title="No activity yet." />;
  return <Timeline items={p.activity.map((e) => ({ id: e.id, at: e.at, title: e.text }))} />;
}
