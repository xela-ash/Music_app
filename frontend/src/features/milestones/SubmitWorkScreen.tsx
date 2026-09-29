import { useState } from "react";
import * as demo from "../../demo/store";
import type { HubMilestone, HubProject, Submission, SubmissionFile } from "../../domain/marketplace";
import { formatDate, formatMoney, isPast } from "../../lib/format";
import { useNav } from "../../nav/context";
import { Field, FileDrop } from "../../ui/controls";
import { Card, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { SubmissionCard } from "./shared";

// M03 → M04. Each submission is a new immutable version; the confirmation
// shows exactly what was recorded.
export function SubmitWorkScreen({ projectId, milestoneId }: { projectId: string; milestoneId: string }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `submit-${projectId}-${milestoneId}`);
  return (
    <Async state={project.state} onRetry={project.reload}>
      {(p) => {
        const m = p.milestones.find((x) => x.id === milestoneId);
        if (!m) return <p className="section-subcopy">That milestone couldn't be found.</p>;
        return <Form project={p} milestone={m} onBack={() => nav.back({ name: "milestone", projectId, milestoneId })} />;
      }}
    </Async>
  );
}

function Form({ project: p, milestone: m, onBack }: { project: HubProject; milestone: HubMilestone; onBack: () => void }) {
  const nav = useNav();
  const [files, setFiles] = useState<SubmissionFile[]>([]);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Submission | null>(null);
  const action = useAction();
  const late = isPast(m.due_at);

  async function submit() {
    const result = await action.run(() => demo.submitWork(p.id, m.id, { files, note }, p.version));
    if (result) {
      setDone(result);
      nav.bumpBadges();
    }
  }

  if (done) {
    return (
      <div>
        <PageHeader eyebrow={`Milestone ${m.milestone_no}`} title="Work submitted" subtitle="The buyer has been notified. Earlier submissions remain available." />
        <SubmissionCard sub={done} />
        <div className="content-actions">
          <button type="button" className="btn btn-primary" onClick={() => nav.replace({ name: "milestone", projectId: p.id, milestoneId: m.id })}>
            Back to milestone
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader onBack={onBack} eyebrow={`Milestone ${m.milestone_no} · ${p.title}`} title={`Submit work: ${m.title}`} subtitle={`${formatMoney(m.amount, p.currency)} · due ${formatDate(m.due_at, "no due date")}`} />
      <PreviewNotice>File storage isn't available yet. File names and sizes are recorded, but the files themselves aren't uploaded.</PreviewNotice>
      {late ? <p className="error-message" role="status">This milestone is past its due date, so the submission will be marked late.</p> : null}
      <Card title="What's required">
        <p>{m.submission_requirements ?? "No specific requirements were set."}</p>
      </Card>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FileDrop label="Files" files={files} onChange={setFiles} disabled={action.submitting} hint="Add every file the milestone requires." />
        <Field label="Note for the buyer (optional)" htmlFor="sw-note">
          <textarea id="sw-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ActionErrorBanner error={action.error} />
        <div className="content-actions">
          <button type="submit" className="btn btn-primary" disabled={action.submitting || files.length === 0}>
            {action.submitting ? "Submitting…" : "Submit work"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={action.submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
