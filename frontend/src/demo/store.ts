// Preview data layer. Every export is an async function that behaves like an
// API call (latency, errors with an HTTP-like status, optimistic-concurrency
// conflicts) so screens are written against the real integration shape.
//
// Nothing here talks to the network and nothing here is authoritative: money
// figures, state transitions and eligibility rules are placeholders that the
// backend will own (Escrow/Payments/Milestones specifications). Replace one
// function at a time with a real client call when its endpoint exists.
import type { Project, ProjectMilestone, Session } from "../domain/types";
import type {
  ActivityEvent,
  AdminDisputeRow,
  Amendment,
  AppNotification,
  Conversation,
  DisputeCase,
  DisputeOutcome,
  Earnings,
  EmailVerificationStatus,
  HubMilestone,
  HubProject,
  HubStatus,
  Message,
  ModerationReview,
  NotificationChannel,
  NotificationPreference,
  Party,
  PaymentAttempt,
  PayoutAccountStatus,
  PayoutReadiness,
  RatingDue,
  Reputation,
  Review,
  Role,
  Submission,
  SubmissionFile,
  TermsVersion,
  Transaction,
  VerificationQueueItem,
  VerificationRecord,
} from "../domain/marketplace";
import { buildSeed, daysFromNow, emptySeed, nextId } from "./seed";

export class DemoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface DemoState {
  meUserId: string;
  me: Party;
  projects: HubProject[];
  messages: Message[];
  readProjects: Set<string>;
  notifications: AppNotification[];
  prefs: NotificationPreference[];
  attempts: PaymentAttempt[];
  transactions: Transaction[];
  reviews: Review[];
  moderation: ModerationReview[];
  disputes: DisputeCase[];
  verification: VerificationRecord;
  queue: VerificationQueueItem[];
  email: { status: EmailVerificationStatus; address: string | null };
  payout: PayoutAccountStatus;
  profileOverrides: Partial<Session["profile"]> | null;
}

let state: DemoState | null = null;

const LATENCY_MS = import.meta.env.MODE === "test" ? 0 : 140;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function settle<T>(work: () => T): Promise<T> {
  await delay();
  return clone(work());
}

function s(): DemoState {
  if (!state) throw new DemoError(500, "Preview data is not initialised.");
  return state;
}

export function partyFromSession(session: Session): Party {
  return {
    user_id: session.user.id,
    display_name: session.profile.display_name,
    handle: session.profile.handle,
    artist_name: session.profile.artist_name,
  };
}

// Idempotent per signed-in user: navigating around never resets data.
export function previewDataEnabled(): boolean {
  return import.meta.env.VITE_PREVIEW_DATA !== "off";
}

export function initDemo(session: Session): void {
  if (state && state.meUserId === session.user.id) return;
  const me = partyFromSession(session);
  const seed = previewDataEnabled() ? buildSeed(me) : emptySeed();
  state = {
    meUserId: me.user_id,
    me,
    projects: seed.projects,
    messages: seed.messages,
    readProjects: new Set(),
    notifications: seed.notifications,
    prefs: seed.prefs,
    attempts: [],
    transactions: [],
    reviews: seed.reviews.map((r) => ({
      ...r,
      // Reviews seeded "about me" and "by me" must point at the real user id.
      rater: r.rater.handle === me.handle ? { ...r.rater, user_id: me.user_id } : r.rater,
      ratee: r.ratee.handle === me.handle ? { ...r.ratee, user_id: me.user_id } : r.ratee,
    })),
    moderation: seed.moderation,
    disputes: seed.disputes,
    verification: seed.verification,
    queue: seed.queue,
    email: { status: "pending", address: session.user.email },
    payout: "not_started",
    profileOverrides: null,
  };
  // Seed a couple of historical transactions so Earnings/Transactions are not empty.
  if (state.projects.length === 0) return;
  const p1 = state.projects[0];
  state.transactions.push(
    txn(p1, p1.milestones[0], "funding", p1.total, -22, "completed"),
    txn(p1, p1.milestones[0], "release", p1.milestones[0].amount, -10, "completed")
  );
  const p4 = state.projects[3];
  state.transactions.push(txn(p4, null, "funding", p4.total, -14, "completed"));
}

export function resetDemo(): void {
  state = null;
}

function txn(
  project: HubProject,
  milestone: HubMilestone | null,
  type: Transaction["type"],
  amount: number,
  daysAgo: number,
  status: Transaction["status"]
): Transaction {
  return {
    id: nextId("txn"),
    project_id: project.id,
    project_title: project.title,
    milestone_no: milestone ? milestone.milestone_no : null,
    milestone_title: milestone ? milestone.title : null,
    type,
    amount,
    currency: project.currency,
    status,
    at: daysFromNow(daysAgo),
    reference: `REF-${nextId("r").toUpperCase()}`,
  };
}

// ---- Projects ---------------------------------------------------------------
function findProject(id: string): HubProject {
  const p = s().projects.find((x) => x.id === id);
  if (!p) throw new DemoError(404, "Project not found");
  return p;
}

function roleOf(p: HubProject): Role {
  const me = s().meUserId;
  if (p.buyer.user_id === me) return "buyer";
  if (p.seller.user_id === me) return "seller";
  throw new DemoError(403, "You are not a participant in this project.");
}

function requireRole(p: HubProject, role: Role): void {
  if (roleOf(p) !== role) {
    throw new DemoError(403, `Only the ${role} can do this.`);
  }
}

function checkVersion(p: HubProject, expected: number | undefined): void {
  if (expected !== undefined && expected !== p.version) {
    throw new DemoError(409, "This project was updated since you opened it. Reload to see the latest terms.");
  }
}

function log(p: HubProject, text: string): void {
  const entry: ActivityEvent = { id: nextId("evt"), at: new Date().toISOString(), text };
  p.activity.unshift(entry);
}

function systemMessage(p: HubProject, body: string): void {
  s().messages.push({
    id: nextId("msg"),
    project_id: p.id,
    sender_user_id: null,
    kind: "system",
    body,
    at: new Date().toISOString(),
    attachments: [],
    deleted: false,
  });
}

function bump(p: HubProject): void {
  p.version += 1;
}

function recompute(p: HubProject): void {
  p.total = p.milestones.reduce((sum, m) => sum + m.amount, 0);
  p.funded = p.milestones.filter((m) => m.money !== "unfunded").reduce((sum, m) => sum + m.amount, 0);
  p.released = p.milestones.filter((m) => m.money === "released").reduce((sum, m) => sum + m.amount, 0);
  p.refunded = p.milestones.filter((m) => m.money === "refunded").reduce((sum, m) => sum + m.amount, 0);
  p.files = p.milestones.flatMap((m) =>
    m.submissions.flatMap((sub) =>
      sub.files.map((f) => ({ ...f, milestone_no: m.milestone_no, submission_version: sub.version, at: sub.submitted_at }))
    )
  );
}

export function projectRole(p: HubProject, userId: string): Role {
  return p.buyer.user_id === userId ? "buyer" : "seller";
}

export async function listProjects(): Promise<HubProject[]> {
  return settle(() => s().projects.filter((p) => p.buyer.user_id === s().meUserId || p.seller.user_id === s().meUserId));
}

export async function getProject(id: string): Promise<HubProject> {
  return settle(() => {
    const p = findProject(id);
    roleOf(p);
    return p;
  });
}

// Registers a project that already exists on the real backend so the hub can
// show it. Milestones are only known right after creation (GET /projects does
// not return them yet), so a project adopted without them shows none.
export function adoptLiveProject(
  live: Project,
  milestones: ProjectMilestone[] | null,
  buyer: Party,
  seller: Party
): void {
  if (!state) return;
  const existing = state.projects.find((p) => p.id === live.id);
  const mapped: HubMilestone[] = (milestones ?? []).map((m) => ({
    id: m.id,
    milestone_no: m.milestone_no,
    title: m.title,
    description: m.description,
    amount: m.amount,
    due_at: m.due_at,
    revision_allowance: live.revision_limit,
    submission_requirements: null,
    status: "planned",
    money: "unfunded",
    submissions: [],
  }));
  const statusMap: Record<Project["state"], HubStatus> = {
    draft: "draft",
    accepted: "awaiting_funding",
    funded: "active",
    in_progress: "active",
    delivered: "active",
    buyer_rated: "completed",
    seller_rated: "completed",
    completed: "completed",
    cancelled: "cancelled",
    disputed: "disputed",
  };
  if (existing) {
    if (mapped.length > 0 && existing.milestones.length === 0) {
      existing.milestones = mapped;
      recompute(existing);
    }
    existing.status = statusMap[live.state];
    if (typeof live.version === "number") existing.version = live.version;
    return;
  }
  const hub: HubProject = {
    id: live.id,
    version: typeof live.version === "number" ? live.version : 1,
    origin: "live",
    title: live.title,
    brief: live.requirements,
    currency: live.currency,
    total: live.price_amount,
    delivery_days: live.delivery_days,
    revision_limit: live.revision_limit,
    buyer,
    seller,
    status: statusMap[live.state],
    created_at: live.created_at,
    accepted_at: live.accepted_at,
    funded: 0,
    released: 0,
    refunded: 0,
    milestones: mapped,
    terms: [],
    amendments: [],
    activity: [{ id: nextId("evt"), at: live.created_at, text: "Draft project created" }],
    files: [],
    ratings_open: { buyer_can_rate: false, seller_can_rate: false },
    dispute_id: null,
  };
  hub.terms = [
    {
      version: 1,
      title: hub.title,
      brief: hub.brief,
      total: live.price_amount,
      currency: live.currency,
      delivery_days: live.delivery_days,
      revision_limit: live.revision_limit,
      milestones: mapped.map((m) => ({
        milestone_no: m.milestone_no,
        title: m.title,
        description: m.description,
        amount: m.amount,
        due_at: m.due_at,
        revision_allowance: m.revision_allowance,
        submission_requirements: m.submission_requirements,
      })),
      accepted_by: null,
      accepted_at: null,
      superseded_at: null,
    },
  ];
  state.projects.push(hub);
}

// A live project whose invitation call just succeeded is now awaiting the seller.
export function markProposalSent(projectId: string): void {
  if (!state) return;
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return;
  p.status = "proposal_sent";
  p.activity.unshift({ id: nextId("evt"), at: new Date().toISOString(), text: "Proposal sent to the seller" });
}

export async function respondToProposal(projectId: string, decision: "accept" | "decline", expectedVersion?: number): Promise<HubProject> {
  return settle(() => {
    const p = findProject(projectId);
    requireRole(p, "seller");
    checkVersion(p, expectedVersion);
    if (p.status !== "proposal_sent") throw new DemoError(409, "This proposal is no longer open.");
    if (decision === "accept") {
      p.status = "awaiting_funding";
      p.accepted_at = new Date().toISOString();
      p.terms[p.terms.length - 1].accepted_by = s().me.display_name;
      p.terms[p.terms.length - 1].accepted_at = p.accepted_at;
      log(p, "Seller accepted the proposal");
      systemMessage(p, "The seller accepted the proposal. The buyer can now fund the project.");
    } else {
      p.status = "cancelled";
      log(p, "Seller declined the proposal");
    }
    bump(p);
    return p;
  });
}

// ---- Funding ----------------------------------------------------------------
export async function createPaymentAttempt(projectId: string, expectedVersion?: number): Promise<PaymentAttempt> {
  return settle(() => {
    const p = findProject(projectId);
    requireRole(p, "buyer");
    checkVersion(p, expectedVersion);
    if (p.status !== "awaiting_funding") throw new DemoError(409, "This project is not waiting for funding.");
    const attemptNo = s().attempts.filter((a) => a.project_id === p.id).length + 1;
    const attempt: PaymentAttempt = {
      id: nextId("pay"),
      project_id: p.id,
      attempt_no: attemptNo,
      amount: p.total,
      currency: p.currency,
      status: "created",
      reference: `PAY-${nextId("ref").toUpperCase()}`,
      failure_reason: null,
      created_at: new Date().toISOString(),
    };
    s().attempts.push(attempt);
    return attempt;
  });
}

export type SimulatedProviderResult = "succeed" | "fail" | "cancel";

// Moves an attempt through the provider-neutral lifecycle. `step` mirrors the
// redirect / OTP / 3DS continuation a real provider would drive.
export async function advancePayment(attemptId: string, step: "continue" | SimulatedProviderResult): Promise<PaymentAttempt> {
  return settle(() => {
    const a = s().attempts.find((x) => x.id === attemptId);
    if (!a) throw new DemoError(404, "Payment attempt not found");
    const p = findProject(a.project_id);
    requireRole(p, "buyer");
    if (a.status === "succeeded" || a.status === "failed" || a.status === "cancelled") {
      throw new DemoError(409, "This payment attempt has already finished.");
    }
    if (step === "continue") {
      a.status = a.status === "created" ? "action_required" : "processing";
      return a;
    }
    if (step === "cancel") {
      a.status = "cancelled";
      return a;
    }
    if (step === "fail") {
      a.status = "failed";
      a.failure_reason = "The payment could not be authorised by your bank.";
      return a;
    }
    a.status = "succeeded";
    p.status = "active";
    p.milestones.forEach((m, i) => {
      m.money = "escrow";
      if (i === 0) m.status = "in_progress";
    });
    recompute(p);
    s().transactions.push(txn(p, null, "funding", p.total, 0, "completed"));
    log(p, "Project funded in full");
    systemMessage(p, "Funding confirmed. Milestone 1 is now in progress.");
    bump(p);
    return a;
  });
}

export async function getPaymentAttempt(id: string): Promise<PaymentAttempt> {
  return settle(() => {
    const a = s().attempts.find((x) => x.id === id);
    if (!a) throw new DemoError(404, "Payment attempt not found");
    return a;
  });
}

// ---- Milestones -------------------------------------------------------------
function findMilestone(p: HubProject, id: string): HubMilestone {
  const m = p.milestones.find((x) => x.id === id);
  if (!m) throw new DemoError(404, "Milestone not found");
  return m;
}

export function revisionsUsed(m: HubMilestone): number {
  return m.submissions.filter((sub) => sub.decision === "revision_requested").length;
}

export async function startMilestone(projectId: string, milestoneId: string, expectedVersion?: number): Promise<HubProject> {
  return settle(() => {
    const p = findProject(projectId);
    requireRole(p, "seller");
    checkVersion(p, expectedVersion);
    const m = findMilestone(p, milestoneId);
    if (p.status !== "active") throw new DemoError(409, "The project is not active.");
    if (m.status !== "planned") throw new DemoError(409, "This milestone has already started.");
    const previous = p.milestones.find((x) => x.milestone_no === m.milestone_no - 1);
    if (previous && previous.status !== "released") {
      throw new DemoError(409, "Finish the previous milestone before starting this one.");
    }
    m.status = "in_progress";
    log(p, `Milestone ${m.milestone_no} started`);
    bump(p);
    return p;
  });
}

export interface SubmitWorkInput {
  files: SubmissionFile[];
  note: string;
}

export async function submitWork(projectId: string, milestoneId: string, input: SubmitWorkInput, expectedVersion?: number): Promise<Submission> {
  return settle(() => {
    const p = findProject(projectId);
    requireRole(p, "seller");
    checkVersion(p, expectedVersion);
    const m = findMilestone(p, milestoneId);
    if (m.status !== "in_progress" && m.status !== "revision_requested") {
      throw new DemoError(409, "This milestone is not open for submissions.");
    }
    if (input.files.length === 0) throw new DemoError(400, "Add at least one file to submit.");
    const late = m.due_at !== null && new Date(m.due_at).getTime() < Date.now();
    const sub: Submission = {
      id: nextId("sub"),
      version: m.submissions.length + 1,
      submitted_at: new Date().toISOString(),
      files: input.files,
      note: input.note.trim() ? input.note.trim() : null,
      late,
      decision: "pending",
      decision_at: null,
      revision_reason: null,
    };
    m.submissions.push(sub); // immutable history: never overwrite a prior version
    m.status = "delivered";
    m.money = "held";
    recompute(p);
    log(p, `Submission v${sub.version} uploaded for milestone ${m.milestone_no}`);
    systemMessage(p, `Milestone ${m.milestone_no} was submitted for review.`);
    bump(p);
    return sub;
  });
}

export async function approveSubmission(projectId: string, milestoneId: string, expectedVersion?: number): Promise<HubProject> {
  return settle(() => {
    const p = findProject(projectId);
    requireRole(p, "buyer");
    checkVersion(p, expectedVersion);
    const m = findMilestone(p, milestoneId);
    const sub = m.submissions[m.submissions.length - 1];
    if (m.status !== "delivered" || !sub || sub.decision !== "pending") {
      throw new DemoError(409, "There is no submission waiting for review.");
    }
    sub.decision = "approved";
    sub.decision_at = new Date().toISOString();
    // Rating never blocks release (Ratings specification).
    m.status = "released";
    m.money = "released";
    recompute(p);
    s().transactions.push(txn(p, m, "release", m.amount, 0, "completed"));
    log(p, `Milestone ${m.milestone_no} approved and released`);
    systemMessage(p, `Milestone ${m.milestone_no} approved. ${m.amount / 100} was released to the seller.`);
    if (p.milestones.every((x) => x.status === "released")) {
      p.status = "completed";
      p.ratings_open = { buyer_can_rate: true, seller_can_rate: true };
      log(p, "Project completed");
    }
    bump(p);
    return p;
  });
}

export async function requestRevision(projectId: string, milestoneId: string, reason: string, expectedVersion?: number): Promise<HubProject> {
  return settle(() => {
    const p = findProject(projectId);
    requireRole(p, "buyer");
    checkVersion(p, expectedVersion);
    const m = findMilestone(p, milestoneId);
    const sub = m.submissions[m.submissions.length - 1];
    if (m.status !== "delivered" || !sub || sub.decision !== "pending") {
      throw new DemoError(409, "There is no submission waiting for review.");
    }
    if (!reason.trim()) throw new DemoError(400, "Describe the changes you need.");
    if (revisionsUsed(m) >= m.revision_allowance) {
      throw new DemoError(409, "No revisions remain for this milestone.");
    }
    sub.decision = "revision_requested";
    sub.decision_at = new Date().toISOString();
    sub.revision_reason = reason.trim();
    m.status = "revision_requested";
    log(p, `Revision requested on milestone ${m.milestone_no}`);
    systemMessage(p, `A revision was requested on milestone ${m.milestone_no}.`);
    bump(p);
    return p;
  });
}

// ---- Amendments -------------------------------------------------------------
export interface AmendmentInput {
  brief: string;
  delivery_days: number;
  revision_limit: number;
  milestones: Array<{ milestone_no: number; title: string; amount: number; due_at: string | null; revision_allowance: number }>;
}

function snapshot(p: HubProject): TermsVersion["milestones"] {
  return p.milestones.map((m) => ({
    milestone_no: m.milestone_no,
    title: m.title,
    description: m.description,
    amount: m.amount,
    due_at: m.due_at,
    revision_allowance: m.revision_allowance,
    submission_requirements: m.submission_requirements,
  }));
}

export async function proposeAmendment(projectId: string, input: AmendmentInput, expectedVersion?: number): Promise<Amendment> {
  return settle(() => {
    const p = findProject(projectId);
    const role = roleOf(p);
    checkVersion(p, expectedVersion);
    if (p.status !== "active" && p.status !== "awaiting_funding") {
      throw new DemoError(409, "Terms can only be amended on an accepted project.");
    }
    const current = p.terms[p.terms.length - 1];
    const changes: Amendment["changes"] = [];
    const affected: number[] = [];
    if (input.brief.trim() !== current.brief) changes.push({ label: "Project brief", from: current.brief, to: input.brief.trim() });
    if (input.delivery_days !== current.delivery_days)
      changes.push({ label: "Delivery days", from: String(current.delivery_days), to: String(input.delivery_days) });
    if (input.revision_limit !== current.revision_limit)
      changes.push({ label: "Revision limit", from: String(current.revision_limit), to: String(input.revision_limit) });
    const money = (n: number) => `₹${(n / 100).toLocaleString("en-IN")}`;
    const proposedMilestones = current.milestones.map((old) => {
      const next = input.milestones.find((m) => m.milestone_no === old.milestone_no);
      if (!next) return old;
      const live = p.milestones.find((m) => m.milestone_no === old.milestone_no);
      if (live && live.status !== "planned" && (next.amount !== old.amount || next.title !== old.title)) {
        throw new DemoError(409, `Milestone ${old.milestone_no} has already started; its scope and amount cannot change.`);
      }
      if (next.title !== old.title) changes.push({ label: `Milestone ${old.milestone_no} title`, from: old.title, to: next.title });
      if (next.amount !== old.amount) {
        changes.push({ label: `Milestone ${old.milestone_no} amount`, from: money(old.amount), to: money(next.amount) });
      }
      if (next.due_at !== old.due_at)
        changes.push({
          label: `Milestone ${old.milestone_no} due date`,
          from: old.due_at ? new Date(old.due_at).toLocaleDateString("en-IN") : "None",
          to: next.due_at ? new Date(next.due_at).toLocaleDateString("en-IN") : "None",
        });
      if (next.revision_allowance !== old.revision_allowance)
        changes.push({ label: `Milestone ${old.milestone_no} revisions`, from: String(old.revision_allowance), to: String(next.revision_allowance) });
      if (changes.some((c) => c.label.startsWith(`Milestone ${old.milestone_no} `))) affected.push(old.milestone_no);
      return { ...old, title: next.title, amount: next.amount, due_at: next.due_at, revision_allowance: next.revision_allowance };
    });
    if (changes.length === 0) throw new DemoError(400, "Change at least one term before sending an amendment.");
    const proposedTotal = proposedMilestones.reduce((sum, m) => sum + m.amount, 0);
    // A newer proposal supersedes any that is still open.
    p.amendments.forEach((a) => {
      if (a.status === "pending") a.status = "superseded";
    });
    const amendment: Amendment = {
      id: nextId("amd"),
      proposed_by_user_id: s().meUserId,
      proposed_at: new Date().toISOString(),
      expires_at: daysFromNow(3),
      status: "pending",
      changes,
      financial_delta: proposedTotal - current.total,
      affected_milestones: affected,
      proposed_milestones: proposedMilestones,
      proposed_total: proposedTotal,
      proposed_brief: input.brief.trim(),
      proposed_delivery_days: input.delivery_days,
      proposed_revision_limit: input.revision_limit,
    };
    p.amendments.unshift(amendment);
    log(p, `${role === "buyer" ? "Buyer" : "Seller"} proposed an amendment`);
    bump(p);
    return amendment;
  });
}

export async function respondToAmendment(projectId: string, amendmentId: string, decision: "accept" | "reject" | "withdraw", expectedVersion?: number): Promise<HubProject> {
  return settle(() => {
    const p = findProject(projectId);
    roleOf(p);
    checkVersion(p, expectedVersion);
    const a = p.amendments.find((x) => x.id === amendmentId);
    if (!a) throw new DemoError(404, "Amendment not found");
    if (a.status !== "pending") throw new DemoError(409, `This amendment is ${a.status}.`);
    if (new Date(a.expires_at).getTime() < Date.now()) {
      a.status = "expired";
      throw new DemoError(409, "This amendment has expired.");
    }
    const mine = a.proposed_by_user_id === s().meUserId;
    if (decision === "withdraw") {
      if (!mine) throw new DemoError(403, "Only the proposer can withdraw an amendment.");
      a.status = "withdrawn";
      log(p, "Amendment withdrawn");
    } else {
      if (mine) throw new DemoError(403, "The other party has to respond to your amendment.");
      if (decision === "reject") {
        a.status = "rejected";
        log(p, "Amendment rejected");
      } else {
        a.status = "accepted";
        const previous = p.terms[p.terms.length - 1];
        previous.superseded_at = new Date().toISOString();
        p.brief = a.proposed_brief;
        p.delivery_days = a.proposed_delivery_days;
        p.revision_limit = a.proposed_revision_limit;
        a.proposed_milestones.forEach((pm) => {
          const live = p.milestones.find((m) => m.milestone_no === pm.milestone_no);
          if (live) {
            live.title = pm.title;
            live.amount = pm.amount;
            live.due_at = pm.due_at;
            live.revision_allowance = pm.revision_allowance;
          }
        });
        recompute(p);
        p.terms.push({
          version: previous.version + 1,
          title: p.title,
          brief: p.brief,
          total: p.total,
          currency: p.currency,
          delivery_days: p.delivery_days,
          revision_limit: p.revision_limit,
          milestones: snapshot(p),
          accepted_by: s().me.display_name,
          accepted_at: new Date().toISOString(),
          superseded_at: null,
        });
        log(p, `Amendment accepted — terms are now version ${previous.version + 1}`);
      }
    }
    bump(p);
    return p;
  });
}

// ---- Messaging --------------------------------------------------------------
export async function listConversations(): Promise<Conversation[]> {
  return settle(() => {
    const st = s();
    return st.projects
      .filter((p) => p.buyer.user_id === st.meUserId || p.seller.user_id === st.meUserId)
      .map((p): Conversation | null => {
        const msgs = st.messages.filter((m) => m.project_id === p.id);
        if (msgs.length === 0) return null;
        const last = msgs[msgs.length - 1];
        const other = p.buyer.user_id === st.meUserId ? p.seller : p.buyer;
        // Unread = the last person-written message came from the other party and I
        // haven't opened the conversation since. System notices don't count.
        const lastPerson = [...msgs].reverse().find((m) => m.kind === "user");
        const fromOther = lastPerson !== undefined && lastPerson.sender_user_id !== st.meUserId;
        return {
          project_id: p.id,
          project_title: p.title,
          project_status: p.status,
          counterparty: other,
          latest: last.deleted ? "Message deleted" : last.body,
          latest_at: last.at,
          unread: fromOther && !st.readProjects.has(p.id),
        };
      })
      .filter((c): c is Conversation => c !== null)
      .sort((a, b) => b.latest_at.localeCompare(a.latest_at));
  });
}

export async function getConversation(projectId: string): Promise<{ project: HubProject; messages: Message[] }> {
  return settle(() => {
    const p = findProject(projectId);
    roleOf(p);
    // Read state is private to the reader — never exposed to the counterparty.
    s().readProjects.add(projectId);
    return { project: p, messages: s().messages.filter((m) => m.project_id === projectId) };
  });
}

export async function sendMessage(projectId: string, body: string, attachments: SubmissionFile[]): Promise<Message> {
  return settle(() => {
    const p = findProject(projectId);
    roleOf(p);
    if (!body.trim() && attachments.length === 0) throw new DemoError(400, "Write a message or attach a file.");
    const msg: Message = {
      id: nextId("msg"),
      project_id: projectId,
      sender_user_id: s().meUserId,
      kind: "user",
      body: body.trim(),
      at: new Date().toISOString(),
      attachments,
      deleted: false,
    };
    s().messages.push(msg);
    s().readProjects.add(projectId);
    return msg;
  });
}

// Tombstone: hides the body in ordinary display. The retained evidence stays
// available server-side for disputes/moderation, so the record is kept here.
export async function tombstoneMessage(projectId: string, messageId: string): Promise<Message> {
  return settle(() => {
    const msg = s().messages.find((m) => m.id === messageId && m.project_id === projectId);
    if (!msg) throw new DemoError(404, "Message not found");
    if (msg.sender_user_id !== s().meUserId) throw new DemoError(403, "You can only delete your own messages.");
    msg.deleted = true;
    return msg;
  });
}

export async function unreadMessageCount(): Promise<number> {
  const conversations = await listConversations();
  return conversations.filter((c) => c.unread).length;
}

// ---- Notifications ----------------------------------------------------------
export async function listNotifications(): Promise<AppNotification[]> {
  return settle(() => [...s().notifications].sort((a, b) => b.at.localeCompare(a.at)));
}

export async function markNotificationRead(id: string): Promise<void> {
  return settle(() => {
    const n = s().notifications.find((x) => x.id === id);
    if (n) n.read = true;
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  return settle(() => {
    s().notifications.forEach((n) => (n.read = true));
  });
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  return settle(() => s().prefs);
}

export async function setNotificationPreference(
  category: NotificationPreference["category"],
  channel: NotificationChannel,
  enabled: boolean
): Promise<NotificationPreference[]> {
  return settle(() => {
    const pref = s().prefs.find((x) => x.category === category);
    if (!pref) throw new DemoError(404, "Unknown category");
    if (pref.mandatory && !enabled && (channel === "in_app" || channel === "email")) {
      throw new DemoError(409, "Mandatory notices cannot be switched off.");
    }
    pref.channels[channel] = enabled;
    return s().prefs;
  });
}

// ---- Ratings ----------------------------------------------------------------
export async function ratingsDue(): Promise<RatingDue[]> {
  return settle(() => {
    const st = s();
    const rated = new Set(st.reviews.filter((r) => r.rater.user_id === st.meUserId).map((r) => r.project_id));
    return st.projects
      .filter((p) => {
        if (rated.has(p.id)) return false;
        const role = p.buyer.user_id === st.meUserId ? "buyer" : p.seller.user_id === st.meUserId ? "seller" : null;
        if (!role) return false;
        return role === "buyer" ? p.ratings_open.buyer_can_rate : p.ratings_open.seller_can_rate;
      })
      .map((p) => {
        const iAmBuyer = p.buyer.user_id === st.meUserId;
        return {
          project_id: p.id,
          project_title: p.title,
          counterparty: iAmBuyer ? p.seller : p.buyer,
          role_rated: iAmBuyer ? ("seller" as const) : ("buyer" as const),
        };
      });
  });
}

export async function getRatingDue(projectId: string): Promise<RatingDue> {
  const due = await ratingsDue();
  const item = due.find((d) => d.project_id === projectId);
  if (!item) throw new DemoError(404, "There is nothing to rate on this project.");
  return item;
}

export async function submitRating(projectId: string, score: number, text: string): Promise<Review> {
  return settle(() => {
    const p = findProject(projectId);
    const role = roleOf(p);
    const st = s();
    if (st.reviews.some((r) => r.project_id === projectId && r.rater.user_id === st.meUserId)) {
      throw new DemoError(409, "You have already rated this project.");
    }
    const ratee = role === "buyer" ? p.seller : p.buyer;
    const review: Review = {
      id: nextId("rv"),
      project_id: p.id,
      project_title: p.title,
      rater: { user_id: st.me.user_id, display_name: st.me.display_name, handle: st.me.handle },
      ratee: { user_id: ratee.user_id, display_name: ratee.display_name, handle: ratee.handle },
      ratee_role: role === "buyer" ? "seller" : "buyer",
      score,
      text: text.trim(),
      at: new Date().toISOString(),
      status: "PUBLISHED",
    };
    st.reviews.push(review);
    st.moderation.push({ ...review, evidence_case: null });
    return review;
  });
}

export async function myReviews(): Promise<{ received: Review[]; given: Review[]; reputation: Reputation }> {
  return settle(() => {
    const st = s();
    const received = st.reviews.filter((r) => r.ratee.user_id === st.meUserId);
    const given = st.reviews.filter((r) => r.rater.user_id === st.meUserId);
    return { received, given, reputation: reputationOf(st.meUserId) };
  });
}

function reputationOf(userId: string): Reputation {
  const published = s().reviews.filter((r) => r.ratee.user_id === userId && r.status === "PUBLISHED");
  const stat = (role: Role) => {
    const list = published.filter((r) => r.ratee_role === role);
    return {
      average: list.length ? list.reduce((sum, r) => sum + r.score, 0) / list.length : null,
      count: list.length,
    };
  };
  return { as_seller: stat("seller"), as_buyer: stat("buyer") };
}

export async function creatorReviews(userId: string): Promise<{ reviews: Review[]; reputation: Reputation }> {
  return settle(() => {
    // Only PUBLISHED reviews are public and only they contribute to reputation.
    const reviews = s()
      .reviews.filter((r) => r.ratee.user_id === userId && r.status === "PUBLISHED")
      .sort((a, b) => b.at.localeCompare(a.at));
    return { reviews, reputation: reputationOf(userId) };
  });
}

// ---- Disputes ---------------------------------------------------------------
export function disputeEligibility(p: HubProject): { allowed: boolean; reason: string } {
  if (p.dispute_id) return { allowed: false, reason: "A dispute already exists for this project." };
  if (p.status !== "active") return { allowed: false, reason: "Disputes can only be opened on an active project." };
  if (!p.milestones.some((m) => ["delivered", "revision_requested", "in_progress"].includes(m.status))) {
    return { allowed: false, reason: "There is no milestone in progress to dispute." };
  }
  return { allowed: true, reason: "" };
}

export async function openDispute(
  projectId: string,
  milestoneNo: number | null,
  input: { category: string; claim: string; evidence: SubmissionFile[] }
): Promise<DisputeCase> {
  return settle(() => {
    const p = findProject(projectId);
    const role = roleOf(p);
    const eligible = disputeEligibility(p);
    if (!eligible.allowed) throw new DemoError(409, eligible.reason);
    if (!input.category) throw new DemoError(400, "Choose a dispute category.");
    if (!input.claim.trim()) throw new DemoError(400, "Summarise your claim.");
    const d: DisputeCase = {
      id: nextId("dsp"),
      project_id: p.id,
      project_title: p.title,
      milestone_no: milestoneNo,
      claimant: role === "buyer" ? p.buyer : p.seller,
      respondent: role === "buyer" ? p.seller : p.buyer,
      claimant_role: role,
      category: input.category,
      claim: input.claim.trim(),
      evidence: input.evidence,
      response: null,
      response_deadline: daysFromNow(5),
      status: "opened",
      timeline: [{ id: nextId("evt"), at: new Date().toISOString(), text: "Dispute opened" }],
      decision: null,
      assigned_reviewer: null,
      opened_at: new Date().toISOString(),
    };
    s().disputes.push(d);
    p.dispute_id = d.id;
    p.status = "disputed";
    if (milestoneNo !== null) {
      const m = p.milestones.find((x) => x.milestone_no === milestoneNo);
      if (m) m.status = "disputed";
    }
    log(p, "Dispute opened");
    bump(p);
    return d;
  });
}

export async function getDispute(id: string): Promise<{ dispute: DisputeCase; role: Role }> {
  return settle(() => {
    const d = s().disputes.find((x) => x.id === id);
    if (!d) throw new DemoError(404, "Dispute not found");
    const me = s().meUserId;
    if (d.claimant.user_id !== me && d.respondent.user_id !== me) throw new DemoError(403, "You are not a party to this dispute.");
    return { dispute: d, role: d.claimant.user_id === me ? d.claimant_role : d.claimant_role === "buyer" ? "seller" : "buyer" };
  });
}

export async function listMyDisputes(): Promise<DisputeCase[]> {
  return settle(() => s().disputes.filter((d) => d.claimant.user_id === s().meUserId || d.respondent.user_id === s().meUserId));
}

export async function respondToDispute(id: string, text: string, evidence: SubmissionFile[]): Promise<DisputeCase> {
  return settle(() => {
    const d = s().disputes.find((x) => x.id === id);
    if (!d) throw new DemoError(404, "Dispute not found");
    if (d.respondent.user_id !== s().meUserId) throw new DemoError(403, "Only the respondent can respond.");
    if (d.status !== "opened") throw new DemoError(409, "This case is no longer accepting a response.");
    if (!text.trim()) throw new DemoError(400, "Write your response.");
    d.response = { text: text.trim(), evidence, at: new Date().toISOString() };
    d.status = "under_review";
    d.timeline.push({ id: nextId("evt"), at: new Date().toISOString(), text: "Respondent submitted a response" });
    return d;
  });
}

export async function withdrawDispute(id: string): Promise<DisputeCase> {
  return settle(() => {
    const d = s().disputes.find((x) => x.id === id);
    if (!d) throw new DemoError(404, "Dispute not found");
    if (d.claimant.user_id !== s().meUserId) throw new DemoError(403, "Only the claimant can withdraw.");
    if (d.status === "decision_issued" || d.status === "resolved" || d.status === "dismissed") {
      throw new DemoError(409, "A decision has already been issued.");
    }
    d.status = "withdrawn";
    d.timeline.push({ id: nextId("evt"), at: new Date().toISOString(), text: "Claimant withdrew the dispute" });
    const p = findProject(d.project_id);
    p.dispute_id = null;
    p.status = "active";
    p.milestones.forEach((m) => {
      if (m.status === "disputed") m.status = m.submissions.length && m.submissions[m.submissions.length - 1].decision === "pending" ? "delivered" : "in_progress";
    });
    bump(p);
    return d;
  });
}

// ---- Payments and payouts ----------------------------------------------------
export async function getPayoutReadiness(): Promise<PayoutReadiness> {
  return settle(() => ({
    identity: s().verification.status,
    payout_account: s().payout,
    eligible: s().verification.status === "approved" && s().payout === "ready",
  }));
}

export async function advancePayoutOnboarding(): Promise<PayoutAccountStatus> {
  return settle(() => {
    const order: PayoutAccountStatus[] = ["not_started", "onboarding", "pending_review", "ready"];
    const i = order.indexOf(s().payout);
    s().payout = order[Math.min(Math.max(i, 0) + 1, order.length - 1)];
    return s().payout;
  });
}

export async function getEarnings(): Promise<Earnings> {
  return settle(() => {
    const st = s();
    const rows: Earnings["rows"] = [];
    st.projects
      .filter((p) => p.seller.user_id === st.meUserId)
      .forEach((p) =>
        p.milestones.forEach((m) => {
          if (m.money === "unfunded") return;
          rows.push({
            project_id: p.id,
            project_title: p.title,
            milestone_no: m.milestone_no,
            milestone_title: m.title,
            amount: m.amount,
            release_status: m.money === "released" ? "released" : "held",
            payout_status: m.money === "released" ? (st.payout === "ready" ? "paid_out" : "pending") : "not_due",
          });
        })
      );
    const released = rows.filter((r) => r.release_status === "released").reduce((sum, r) => sum + r.amount, 0);
    const paidOut = rows.filter((r) => r.payout_status === "paid_out").reduce((sum, r) => sum + r.amount, 0);
    const held = rows.filter((r) => r.release_status === "held").reduce((sum, r) => sum + r.amount, 0);
    return { total_earned: released, pending: held, released, paid_out: paidOut, rows };
  });
}

export async function listTransactions(): Promise<Transaction[]> {
  return settle(() =>
    s()
      .transactions.filter((t) => {
        const p = s().projects.find((x) => x.id === t.project_id);
        return p ? p.buyer.user_id === s().meUserId || p.seller.user_id === s().meUserId : false;
      })
      .sort((a, b) => b.at.localeCompare(a.at))
  );
}

export async function getTransaction(id: string): Promise<Transaction> {
  return settle(() => {
    const t = s().transactions.find((x) => x.id === id);
    if (!t) throw new DemoError(404, "Transaction not found");
    return t;
  });
}

// ---- Verification -----------------------------------------------------------
export async function getVerification(): Promise<VerificationRecord> {
  return settle(() => s().verification);
}

export async function submitVerification(input: { document_type: string; files: SubmissionFile[]; selfie: boolean; consent: boolean }): Promise<VerificationRecord> {
  return settle(() => {
    const v = s().verification;
    if (!["not_submitted", "rejected", "expired", "revoked", "additional_information_required"].includes(v.status)) {
      throw new DemoError(409, "A verification is already in progress.");
    }
    if (!input.consent) throw new DemoError(400, "You must accept the declaration to submit.");
    if (input.files.length === 0) throw new DemoError(400, "Upload at least one document.");
    const wasAdditional = v.status === "additional_information_required";
    v.status = wasAdditional ? "under_review" : "pending";
    v.submitted_at = new Date().toISOString();
    v.document_type = input.document_type;
    v.reviewer_request = null;
    v.rejection_reason = null;
    const st = s();
    const item: VerificationQueueItem = {
      id: "vq_mine",
      applicant: st.me.display_name,
      handle: st.me.handle,
      submitted_at: v.submitted_at,
      status: v.status,
      legal_name: st.me.display_name,
      document_type: input.document_type,
      documents: input.files,
      has_selfie: input.selfie,
      history: [{ id: nextId("evt"), at: v.submitted_at, text: wasAdditional ? "Additional information provided" : "Submission received" }],
    };
    const idx = st.queue.findIndex((q) => q.id === "vq_mine");
    if (idx >= 0) {
      item.history = [...st.queue[idx].history, ...item.history];
      st.queue[idx] = item;
    } else {
      st.queue.unshift(item);
    }
    return v;
  });
}

export async function getEmailVerification(): Promise<{ status: EmailVerificationStatus; address: string | null }> {
  return settle(() => s().email);
}

export async function resendEmailVerification(): Promise<{ status: EmailVerificationStatus; address: string | null }> {
  return settle(() => {
    if (!s().email.address) throw new DemoError(400, "Add an email address first.");
    s().email.status = "sent";
    return s().email;
  });
}

export async function changeEmailAddress(address: string): Promise<{ status: EmailVerificationStatus; address: string | null }> {
  return settle(() => {
    if (!/^\S+@\S+\.\S+$/.test(address.trim())) throw new DemoError(400, "Enter a valid email address.");
    s().email = { status: "sent", address: address.trim() };
    return s().email;
  });
}

// Preview-only controls so every email state can be seen without a mail server.
export async function simulateEmailState(status: EmailVerificationStatus): Promise<{ status: EmailVerificationStatus; address: string | null }> {
  return settle(() => {
    s().email.status = status;
    return s().email;
  });
}

// ---- Profile edits (public profile editor, preview only) -----------------------
export async function saveProfileOverrides(patch: Partial<Session["profile"]>): Promise<boolean> {
  return settle(() => {
    s().profileOverrides = { ...(s().profileOverrides ?? {}), ...patch };
    return true;
  });
}

export function getProfileOverrides(): Partial<Session["profile"]> | null {
  return state ? state.profileOverrides : null;
}

// ---- Admin ------------------------------------------------------------------
export async function adminVerificationQueue(): Promise<VerificationQueueItem[]> {
  return settle(() => [...s().queue].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)));
}

export async function adminVerificationItem(id: string): Promise<VerificationQueueItem> {
  return settle(() => {
    const item = s().queue.find((q) => q.id === id);
    if (!item) throw new DemoError(404, "Submission not found");
    return item;
  });
}

export async function adminDecideVerification(id: string, decision: "approve" | "reject" | "request_info", note: string): Promise<VerificationQueueItem> {
  return settle(() => {
    const item = s().queue.find((q) => q.id === id);
    if (!item) throw new DemoError(404, "Submission not found");
    if ((decision === "reject" || decision === "request_info") && !note.trim()) {
      throw new DemoError(400, "Add a note the applicant will see.");
    }
    item.status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "additional_information_required";
    item.history.push({
      id: nextId("evt"),
      at: new Date().toISOString(),
      text: decision === "approve" ? "Approved" : decision === "reject" ? `Rejected: ${note.trim()}` : `Information requested: ${note.trim()}`,
    });
    if (id === "vq_mine") {
      const v = s().verification;
      v.status = item.status;
      v.decided_at = new Date().toISOString();
      v.reviewer_request = decision === "request_info" ? note.trim() : null;
      v.rejection_reason = decision === "reject" ? note.trim() : null;
    }
    return item;
  });
}

export async function adminDisputeQueue(): Promise<AdminDisputeRow[]> {
  return settle(() =>
    s().disputes.map((d) => {
      const p = s().projects.find((x) => x.id === d.project_id);
      return {
        id: d.id,
        project_title: d.project_title,
        milestone_no: d.milestone_no,
        buyer: p ? p.buyer.display_name : "—",
        seller: p ? p.seller.display_name : "—",
        category: d.category,
        status: d.status,
        deadline: d.response_deadline,
        assigned_reviewer: d.assigned_reviewer,
      };
    })
  );
}

export async function adminDisputeWorkspace(id: string): Promise<{ dispute: DisputeCase; project: HubProject; messages: Message[]; attempts: PaymentAttempt[] }> {
  return settle(() => {
    const d = s().disputes.find((x) => x.id === id);
    if (!d) throw new DemoError(404, "Dispute not found");
    const project = findProject(d.project_id);
    return {
      dispute: d,
      project,
      messages: s().messages.filter((m) => m.project_id === d.project_id),
      attempts: s().attempts.filter((a) => a.project_id === d.project_id),
    };
  });
}

export async function adminDecideDispute(id: string, outcome: DisputeOutcome, releaseAmount: number, refundAmount: number, rationale: string): Promise<DisputeCase> {
  return settle(() => {
    const d = s().disputes.find((x) => x.id === id);
    if (!d) throw new DemoError(404, "Dispute not found");
    if (d.status === "decision_issued" || d.status === "resolved" || d.status === "dismissed") {
      throw new DemoError(409, "A decision has already been issued.");
    }
    const project = findProject(d.project_id);
    const milestone = d.milestone_no !== null ? project.milestones.find((m) => m.milestone_no === d.milestone_no) : undefined;
    const amount = milestone ? milestone.amount : project.total - project.released;
    if (!rationale.trim()) throw new DemoError(400, "Record the rationale for this decision.");
    let release = releaseAmount;
    let refund = refundAmount;
    if (outcome === "AWARD_SELLER") {
      release = amount;
      refund = 0;
    } else if (outcome === "AWARD_BUYER") {
      release = 0;
      refund = amount;
    } else if (outcome === "DISMISS") {
      release = 0;
      refund = 0;
    } else if (release + refund !== amount) {
      throw new DemoError(400, "Release and refund must add up to the amount in dispute exactly.");
    }
    d.decision = { outcome, rationale: rationale.trim(), release_amount: release, refund_amount: refund, execution: "pending", at: new Date().toISOString() };
    d.status = outcome === "DISMISS" ? "dismissed" : "decision_issued";
    d.timeline.push({ id: nextId("evt"), at: new Date().toISOString(), text: "Decision issued" });
    return d;
  });
}

export async function adminReviews(): Promise<ModerationReview[]> {
  return settle(() => s().moderation);
}

export async function adminModerateReview(id: string, action: "hide" | "remove" | "reinstate"): Promise<ModerationReview> {
  return settle(() => {
    const st = s();
    const m = st.moderation.find((x) => x.id === id);
    if (!m) throw new DemoError(404, "Review not found");
    // Moderation only changes visibility — score and text are never rewritten.
    m.status = action === "hide" ? "HIDDEN" : action === "remove" ? "REMOVED" : "PUBLISHED";
    const r = st.reviews.find((x) => x.id === id);
    if (r) r.status = m.status;
    return m;
  });
}

// ---- Home summary -----------------------------------------------------------
export interface AttentionItem {
  id: string;
  text: string;
  cta: string;
  target: NotificationTargetLite;
}
export type NotificationTargetLite =
  | { kind: "project"; project_id: string }
  | { kind: "milestone"; project_id: string; milestone_id: string }
  | { kind: "fund"; project_id: string }
  | { kind: "rating"; project_id: string }
  | { kind: "dispute"; dispute_id: string }
  | { kind: "verification" };

export interface HomeSummary {
  attention: AttentionItem[];
  active: HubProject[];
  readiness: { profile: boolean; email: EmailVerificationStatus; identity: VerificationRecord["status"]; payout: PayoutAccountStatus };
  unread_notifications: number;
}

export async function getHomeSummary(): Promise<HomeSummary> {
  return settle(() => {
    const st = s();
    const mine = st.projects.filter((p) => p.buyer.user_id === st.meUserId || p.seller.user_id === st.meUserId);
    const attention: AttentionItem[] = [];
    mine.forEach((p) => {
      const role = projectRole(p, st.meUserId);
      if (role === "seller" && p.status === "proposal_sent") {
        attention.push({ id: `a-${p.id}-proposal`, text: `Proposal waiting for your response: ${p.title}`, cta: "Review proposal", target: { kind: "project", project_id: p.id } });
      }
      if (role === "buyer" && p.status === "awaiting_funding") {
        attention.push({ id: `a-${p.id}-fund`, text: `Project needs funding: ${p.title}`, cta: "Fund project", target: { kind: "fund", project_id: p.id } });
      }
      p.milestones.forEach((m) => {
        if (role === "buyer" && m.status === "delivered") {
          attention.push({ id: `a-${m.id}-review`, text: `Work submitted for review: ${m.title}`, cta: "Review submission", target: { kind: "milestone", project_id: p.id, milestone_id: m.id } });
        }
        if (role === "seller" && m.status === "revision_requested") {
          attention.push({ id: `a-${m.id}-rev`, text: `Revision requested: ${m.title}`, cta: "Open milestone", target: { kind: "milestone", project_id: p.id, milestone_id: m.id } });
        }
        if (role === "seller" && m.status === "in_progress" && m.due_at) {
          const days = Math.ceil((new Date(m.due_at).getTime() - Date.now()) / 86400000);
          if (days <= 7) {
            attention.push({ id: `a-${m.id}-due`, text: `Milestone due ${days < 0 ? "and overdue" : `in ${days} day${days === 1 ? "" : "s"}`}: ${m.title}`, cta: "Open milestone", target: { kind: "milestone", project_id: p.id, milestone_id: m.id } });
          }
        }
      });
      if (p.dispute_id) {
        const d = st.disputes.find((x) => x.id === p.dispute_id);
        if (d && d.respondent.user_id === st.meUserId && d.status === "opened") {
          attention.push({ id: `a-${d.id}`, text: `New dispute response required: ${p.title}`, cta: "Respond", target: { kind: "dispute", dispute_id: d.id } });
        }
      }
    });
    const rated = new Set(st.reviews.filter((r) => r.rater.user_id === st.meUserId).map((r) => r.project_id));
    mine.forEach((p) => {
      const role = projectRole(p, st.meUserId);
      const open = role === "buyer" ? p.ratings_open.buyer_can_rate : p.ratings_open.seller_can_rate;
      if (open && !rated.has(p.id)) {
        attention.push({ id: `a-${p.id}-rate`, text: `Rating available: ${p.title}`, cta: "Rate now", target: { kind: "rating", project_id: p.id } });
      }
    });
    if (st.verification.status === "not_submitted") {
      attention.push({ id: "a-verify", text: "Complete identity verification", cta: "Verify identity", target: { kind: "verification" } });
    }
    if (st.verification.status === "additional_information_required") {
      attention.push({ id: "a-verify-info", text: "Verification needs more information", cta: "Provide information", target: { kind: "verification" } });
    }
    return {
      attention,
      active: mine.filter((p) => ["active", "awaiting_funding", "proposal_sent", "disputed"].includes(p.status)),
      readiness: { profile: true, email: st.email.status, identity: st.verification.status, payout: st.payout },
      unread_notifications: st.notifications.filter((n) => !n.read).length,
    };
  });
}

export async function unreadNotificationCount(): Promise<number> {
  return settle(() => s().notifications.filter((n) => !n.read).length);
}
