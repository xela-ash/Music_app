// Types for the marketplace workflow screens (hub, milestones, funding,
// messages, notifications, ratings, disputes, verification, admin).
//
// Most of these have NO backend yet. They are served by the preview data layer
// in src/demo/ and are shaped after the governed specifications in docs/. When a
// real endpoint ships, replace the matching function in src/demo/ — the screens
// only depend on these types. Exact wording of statuses lives in src/lib/labels.ts
// so it can follow the governed vocabulary without touching screens.

export type Role = "buyer" | "seller";

export interface Party {
  user_id: string;
  display_name: string;
  handle: string;
  artist_name: string;
}

// ---- Project hub -----------------------------------------------------------
export type HubStatus =
  | "draft"
  | "proposal_sent"
  | "awaiting_funding"
  | "active"
  | "completed"
  | "cancelled"
  | "refunded"
  | "disputed";

export type HubMilestoneStatus =
  | "planned"
  | "in_progress"
  | "delivered"
  | "revision_requested"
  | "approved"
  | "released"
  | "refunded"
  | "disputed"
  | "cancelled";

export type MoneyStatus = "escrow" | "held" | "released" | "refunded" | "unfunded";

export interface SubmissionFile {
  name: string;
  size_bytes: number;
}

export interface Submission {
  id: string;
  version: number;
  submitted_at: string;
  files: SubmissionFile[];
  note: string | null;
  late: boolean;
  decision: "pending" | "approved" | "revision_requested";
  decision_at: string | null;
  revision_reason: string | null;
}

export interface HubMilestone {
  id: string;
  milestone_no: number;
  title: string;
  description: string | null;
  amount: number;
  due_at: string | null;
  revision_allowance: number;
  submission_requirements: string | null;
  status: HubMilestoneStatus;
  money: MoneyStatus;
  submissions: Submission[];
}

export interface TermsVersion {
  version: number;
  title: string;
  brief: string;
  total: number;
  currency: string;
  delivery_days: number;
  revision_limit: number;
  milestones: Array<Pick<HubMilestone, "milestone_no" | "title" | "description" | "amount" | "due_at" | "revision_allowance" | "submission_requirements">>;
  accepted_by: string | null;
  accepted_at: string | null;
  superseded_at: string | null;
}

export type AmendmentStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "expired" | "superseded";

export interface AmendmentChange {
  label: string;
  from: string;
  to: string;
}

export interface Amendment {
  id: string;
  proposed_by_user_id: string;
  proposed_at: string;
  expires_at: string;
  status: AmendmentStatus;
  changes: AmendmentChange[];
  financial_delta: number;
  affected_milestones: number[];
  proposed_milestones: TermsVersion["milestones"];
  proposed_total: number;
  proposed_brief: string;
  proposed_delivery_days: number;
  proposed_revision_limit: number;
}

export interface ActivityEvent {
  id: string;
  at: string;
  text: string;
}

export interface HubProject {
  id: string;
  version: number; // optimistic concurrency token
  origin: "live" | "preview";
  title: string;
  brief: string;
  currency: string;
  total: number;
  delivery_days: number;
  revision_limit: number;
  buyer: Party;
  seller: Party;
  status: HubStatus;
  created_at: string;
  accepted_at: string | null;
  funded: number;
  released: number;
  refunded: number;
  milestones: HubMilestone[];
  terms: TermsVersion[]; // last entry is current
  amendments: Amendment[];
  activity: ActivityEvent[];
  files: Array<SubmissionFile & { milestone_no: number; submission_version: number; at: string }>;
  ratings_open: { buyer_can_rate: boolean; seller_can_rate: boolean };
  dispute_id: string | null;
}

// ---- Payments --------------------------------------------------------------
export type PaymentAttemptStatus = "created" | "action_required" | "processing" | "succeeded" | "failed" | "cancelled";

export interface PaymentAttempt {
  id: string;
  project_id: string;
  attempt_no: number;
  amount: number;
  currency: string;
  status: PaymentAttemptStatus;
  reference: string;
  failure_reason: string | null;
  created_at: string;
}

export type TransactionType = "funding" | "release" | "refund" | "payout";
export type TransactionStatus = "pending" | "completed" | "failed";

export interface Transaction {
  id: string;
  project_id: string;
  project_title: string;
  milestone_no: number | null;
  milestone_title: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  at: string;
  reference: string;
}

export interface Earnings {
  total_earned: number;
  pending: number;
  released: number;
  paid_out: number;
  rows: Array<{
    project_id: string;
    project_title: string;
    milestone_no: number;
    milestone_title: string;
    amount: number;
    release_status: "held" | "released";
    payout_status: "not_due" | "pending" | "paid_out";
  }>;
}

export type PayoutAccountStatus = "not_started" | "onboarding" | "pending_review" | "ready" | "action_required";

export interface PayoutReadiness {
  identity: VerificationStatus;
  payout_account: PayoutAccountStatus;
  eligible: boolean;
}

// ---- Messaging -------------------------------------------------------------
export interface Message {
  id: string;
  project_id: string;
  sender_user_id: string | null; // null = system message
  kind: "user" | "system";
  body: string;
  at: string;
  attachments: SubmissionFile[];
  deleted: boolean; // tombstoned: ordinary display hides the body
}

export interface Conversation {
  project_id: string;
  project_title: string;
  project_status: HubStatus;
  counterparty: Party;
  latest: string;
  latest_at: string;
  unread: boolean;
}

// ---- Notifications ---------------------------------------------------------
export type NotificationCategory =
  | "security"
  | "projects"
  | "milestones"
  | "deliverables"
  | "payments"
  | "disputes"
  | "messages"
  | "ratings"
  | "verification";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  at: string;
  read: boolean;
  target: NotificationTarget;
}

export type NotificationTarget =
  | { kind: "project"; project_id: string }
  | { kind: "milestone"; project_id: string; milestone_id: string }
  | { kind: "conversation"; project_id: string }
  | { kind: "rating"; project_id: string }
  | { kind: "dispute"; dispute_id: string }
  | { kind: "verification" }
  | { kind: "transaction"; transaction_id: string };

export type NotificationChannel = "in_app" | "email" | "push" | "sms";

export interface NotificationPreference {
  category: NotificationCategory;
  mandatory: boolean; // security/transactional notices cannot be switched off
  channels: Record<NotificationChannel, boolean>;
}

// ---- Ratings ---------------------------------------------------------------
export type ReviewStatus = "PUBLISHED" | "HIDDEN" | "REMOVED";

export interface Review {
  id: string;
  project_id: string;
  project_title: string;
  rater: Pick<Party, "user_id" | "display_name" | "handle">;
  ratee: Pick<Party, "user_id" | "display_name" | "handle">;
  ratee_role: Role; // the role being rated
  // The rating scale is an open product decision, so the score is an opaque
  // number handed to <RatingInput>; nothing here assumes five stars.
  score: number;
  text: string;
  at: string;
  status: ReviewStatus;
}

export interface Reputation {
  as_seller: { average: number | null; count: number };
  as_buyer: { average: number | null; count: number };
}

export interface RatingDue {
  project_id: string;
  project_title: string;
  counterparty: Party;
  role_rated: Role;
}

// ---- Disputes --------------------------------------------------------------
export type DisputeStatus = "opened" | "under_review" | "decision_issued" | "resolved" | "dismissed" | "withdrawn";
export type DisputeOutcome = "AWARD_BUYER" | "AWARD_SELLER" | "SPLIT" | "DISMISS";

export interface DisputeCase {
  id: string;
  project_id: string;
  project_title: string;
  milestone_no: number | null;
  claimant: Party;
  respondent: Party;
  claimant_role: Role;
  category: string;
  claim: string;
  evidence: SubmissionFile[];
  response: { text: string; evidence: SubmissionFile[]; at: string } | null;
  response_deadline: string;
  status: DisputeStatus;
  timeline: ActivityEvent[];
  decision: null | {
    outcome: DisputeOutcome;
    rationale: string;
    release_amount: number;
    refund_amount: number;
    execution: "pending" | "executed" | "blocked";
    at: string;
  };
  assigned_reviewer: string | null;
  opened_at: string;
}

// ---- Verification ----------------------------------------------------------
export type VerificationStatus =
  | "not_submitted"
  | "pending"
  | "under_review"
  | "additional_information_required"
  | "approved"
  | "rejected"
  | "expired"
  | "revoked";

export interface VerificationRecord {
  status: VerificationStatus;
  submitted_at: string | null;
  decided_at: string | null;
  reviewer_request: string | null;
  rejection_reason: string | null;
  document_type: string | null;
}

export type EmailVerificationStatus = "pending" | "sent" | "expired" | "verified" | "error";

// ---- Admin -----------------------------------------------------------------
export interface VerificationQueueItem {
  id: string;
  applicant: string;
  handle: string;
  submitted_at: string;
  status: VerificationStatus;
  legal_name: string;
  document_type: string;
  documents: SubmissionFile[];
  has_selfie: boolean;
  history: ActivityEvent[];
}

export interface AdminDisputeRow {
  id: string;
  project_title: string;
  milestone_no: number | null;
  buyer: string;
  seller: string;
  category: string;
  status: DisputeStatus;
  deadline: string;
  assigned_reviewer: string | null;
}

export interface ModerationReview extends Review {
  evidence_case: string | null;
}
