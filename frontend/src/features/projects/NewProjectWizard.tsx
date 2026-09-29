import { useState } from "react";
import type { CreateProjectMilestonePayload, DiscoverProfile, Project, ProjectMilestone, Session } from "../../domain/types";
import {
  POSTGRES_INT_MAX,
  PROJECT_CURRENCY,
  formatDate,
  formatMoney,
  getErrorMessage,
  parseMoneyToMinorUnits,
  parseNonNegativeIntegerOrDefault,
  parsePositiveInteger,
} from "../../lib/format";
import { createDraftProject, inviteSeller, listLiveProjects } from "../../lib/liveApi";
import { Field } from "../../ui/controls";
import { Card, KeyValue, PageHeader, Stepper } from "../../ui/display";

interface MilestoneRow {
  key: string;
  title: string;
  description: string;
  amountInput: string;
  dueDate: string;
}

const newRow = (): MilestoneRow => ({ key: crypto.randomUUID(), title: "", description: "", amountInput: "", dueDate: "" });
const STEPS = ["Project details", "Milestones", "Review & send"];

// PR02 → PR03 → PR04. "Send proposal" creates the draft (POST /projects) and
// then invites the seller (POST /projects/:id/invitations). If the second call
// fails the draft already exists, so a retry only repeats the invitation.
export function NewProjectWizard({
  session,
  seller,
  onBack,
  onSent,
}: {
  session: Session;
  seller: DiscoverProfile;
  onBack: () => void;
  onSent: (project: Project, milestones: ProjectMilestone[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [daysInput, setDaysInput] = useState("");
  const [revisionsInput, setRevisionsInput] = useState("");
  const [rows, setRows] = useState<MilestoneRow[]>(() => [newRow()]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<{ project: Project; milestones: ProjectMilestone[] } | null>(null);

  const budget = parseMoneyToMinorUnits(budgetInput) ?? 0;
  const milestoneTotal = rows.reduce((sum, r) => sum + (parseMoneyToMinorUnits(r.amountInput) ?? 0), 0);
  const difference = budget - milestoneTotal;

  const update = (key: string, patch: Partial<MilestoneRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function validateDetails(): string {
    if (!title.trim()) return "Project title is required.";
    if (!brief.trim()) return "The project brief is required.";
    const amount = parseMoneyToMinorUnits(budgetInput);
    if (amount === null) return "Enter a valid total in INR, e.g. 1500 or 1500.50.";
    if (amount > POSTGRES_INT_MAX) return "Amount exceeds the supported project limit.";
    if (parsePositiveInteger(daysInput) === null) return "Delivery days must be a whole number greater than 0.";
    if (parseNonNegativeIntegerOrDefault(revisionsInput) === null) return "Revision limit must be a whole number of 0 or more.";
    return "";
  }

  function preparedMilestones(): CreateProjectMilestonePayload[] | string {
    const out: CreateProjectMilestonePayload[] = [];
    for (const r of rows) {
      if (!r.title.trim()) return "Every milestone needs a title.";
      const amount = parseMoneyToMinorUnits(r.amountInput);
      if (amount === null) return "Enter a valid amount for every milestone in INR, e.g. 500 or 500.50.";
      if (amount > POSTGRES_INT_MAX) return "Amount exceeds the supported project limit.";
      out.push({ title: r.title.trim(), description: r.description.trim() || null, amount, due_at: r.dueDate || null });
    }
    if (out.reduce((s, m) => s + m.amount, 0) !== budget) return "Milestone amounts must equal the project total.";
    return out;
  }

  function goNext() {
    setError("");
    if (step === 0) {
      const problem = validateDetails();
      if (problem) return setError(problem);
      return setStep(1);
    }
    if (step === 1) {
      const result = preparedMilestones();
      if (typeof result === "string") return setError(result);
      return setStep(2);
    }
  }

  async function send() {
    setError("");
    const milestones = preparedMilestones();
    if (typeof milestones === "string") return setError(milestones);
    setSending(true);
    let draftSaved = created !== null;
    try {
      let draft = created;
      if (!draft) {
        draft = await createDraftProject({
          seller_user_id: seller.user_id,
          title: title.trim(),
          requirements: brief.trim(),
          price_amount: budget,
          delivery_days: parsePositiveInteger(daysInput) ?? 1,
          revision_limit: parseNonNegativeIntegerOrDefault(revisionsInput) ?? 0,
          milestones,
        });
        setCreated(draft);
        draftSaved = true;
      }
      let version = draft.project.version;
      if (typeof version !== "number") {
        const fresh = (await listLiveProjects()).find((p) => p.id === draft!.project.id);
        version = typeof fresh?.version === "number" ? fresh.version : 1;
      }
      await inviteSeller(draft.project.id, seller.user_id, version);
      onSent({ ...draft.project, version }, draft.milestones);
    } catch (err: unknown) {
      setError(
        draftSaved
          ? `Your draft was saved, but the proposal wasn't sent: ${getErrorMessage(err)}`
          : getErrorMessage(err)
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="create-project">
      <PageHeader
        onBack={step === 0 ? onBack : () => setStep((s) => s - 1)}
        backLabel={step === 0 ? "Back to profile" : "Back"}
        eyebrow="New project"
        title={`Start a project with ${seller.display_name}`}
        subtitle="Define the work, budget and delivery expectations before funding begins."
      />
      <Stepper steps={STEPS} current={step} />

      <div className="collaborator-summary">
        <p className="collaborator-summary-name">{seller.display_name}</p>
        <p className="collaborator-summary-handle">@{seller.handle}</p>
        <p className="collaborator-summary-artist">{seller.artist_name}</p>
      </div>

      {step === 0 ? (
        <form
          className="auth-form create-project-form"
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
        >
          <Field label="Project title" htmlFor="np-title">
            <input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Requirements / brief" htmlFor="np-brief">
            <textarea id="np-brief" value={brief} onChange={(e) => setBrief(e.target.value)} required />
          </Field>
          <Field label="Total project amount (INR)" htmlFor="np-budget" hint="Enter the amount in rupees, for example 1500.00.">
            <input id="np-budget" inputMode="decimal" placeholder="1500.00" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} required />
          </Field>
          <Field label="Delivery days" htmlFor="np-days">
            <input id="np-days" type="number" min="1" step="1" value={daysInput} onChange={(e) => setDaysInput(e.target.value)} required />
          </Field>
          <Field label="Revision limit" htmlFor="np-revisions">
            <input id="np-revisions" type="number" min="0" step="1" placeholder="0" value={revisionsInput} onChange={(e) => setRevisionsInput(e.target.value)} />
          </Field>
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}
          <div className="content-actions">
            <button type="submit" className="btn btn-primary">
              Continue to milestones
            </button>
          </div>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="auth-form create-project-form">
          <p className="section-subcopy">Break the work into fixed, fundable stages. Milestone totals must match the project amount.</p>
          {rows.map((row, i) => (
            <div className="milestone-form-row" key={row.key}>
              <div className="milestone-form-row-header">
                <span className="milestone-form-number">Milestone {i + 1}</span>
                {rows.length > 1 ? (
                  <button type="button" className="btn btn-secondary milestone-remove-btn" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                    Remove
                  </button>
                ) : null}
              </div>
              <Field label="Title" htmlFor={`np-ms-title-${row.key}`}>
                <input id={`np-ms-title-${row.key}`} value={row.title} onChange={(e) => update(row.key, { title: e.target.value })} required />
              </Field>
              <Field label="Description (optional)" htmlFor={`np-ms-desc-${row.key}`}>
                <textarea id={`np-ms-desc-${row.key}`} value={row.description} onChange={(e) => update(row.key, { description: e.target.value })} />
              </Field>
              <div className="milestone-form-row-fields">
                <Field label="Amount (INR)" htmlFor={`np-ms-amt-${row.key}`}>
                  <input id={`np-ms-amt-${row.key}`} inputMode="decimal" placeholder="500.00" value={row.amountInput} onChange={(e) => update(row.key, { amountInput: e.target.value })} required />
                </Field>
                <Field label="Due date (optional)" htmlFor={`np-ms-due-${row.key}`}>
                  <input id={`np-ms-due-${row.key}`} type="date" value={row.dueDate} onChange={(e) => update(row.key, { dueDate: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary add-milestone-btn" onClick={() => setRows((rs) => [...rs, newRow()])}>
            Add milestone
          </button>
          <p className="form-hint">Per-milestone revision allowances and submission requirements will be set here once the API records them; for now the project-level revision limit applies.</p>

          <div className="milestone-summary">
            <div className="milestone-summary-row">
              <span>Project total</span>
              <span>{formatMoney(budget, PROJECT_CURRENCY)}</span>
            </div>
            <div className="milestone-summary-row">
              <span>Milestones</span>
              <span>{formatMoney(milestoneTotal, PROJECT_CURRENCY)}</span>
            </div>
            <div className={`milestone-summary-row milestone-summary-remaining ${difference !== 0 ? "milestone-summary-negative" : ""}`}>
              <span>Difference</span>
              <span>
                {difference < 0 ? "-" : ""}
                {formatMoney(Math.abs(difference), PROJECT_CURRENCY)}
              </span>
            </div>
          </div>

          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={goNext} disabled={difference !== 0}>
              Review project
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="create-project-form">
          <Card title="Proposal summary">
            <KeyValue
              rows={[
                ["Seller", `${seller.display_name} (@${seller.handle})`],
                ["Project", title.trim()],
                ["Total", formatMoney(budget, PROJECT_CURRENCY)],
                ["Currency", PROJECT_CURRENCY],
                ["Delivery", `${daysInput} days`],
                ["Revisions", `${parseNonNegativeIntegerOrDefault(revisionsInput) ?? 0}`],
              ]}
            />
            <h3 className="section-heading section-heading-small">Brief</h3>
            <p className="profile-detail-bio">{brief.trim()}</p>
          </Card>
          <Card title="Milestones">
            <ol className="milestone-list">
              {rows.map((r, i) => (
                <li className="milestone-item" key={r.key}>
                  <div className="milestone-item-number" aria-hidden="true">
                    {i + 1}
                  </div>
                  <div className="milestone-item-body">
                    <p className="milestone-item-title">{r.title.trim()}</p>
                    {r.description.trim() ? <p className="milestone-item-description">{r.description.trim()}</p> : null}
                    <div className="milestone-item-meta">
                      <span>{formatMoney(parseMoneyToMinorUnits(r.amountInput) ?? 0, PROJECT_CURRENCY)}</span>
                      <span>{r.dueDate ? `Due ${formatDate(r.dueDate)}` : "No due date"}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <p className="form-hint">
            {session.profile.display_name}, sending this invites {seller.display_name} to accept these terms. Nothing is charged until they accept and you fund the project.
          </p>
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}
          <div className="content-actions">
            <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
              {sending ? "Sending…" : created ? "Retry sending proposal" : "Send proposal"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={sending}>
              Back to edit
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
