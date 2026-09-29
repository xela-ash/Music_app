// Shared domain types for the parts of the API that exist today. Names mirror
// the database columns and API fields (Handbook §6.2) — do not rename them.

export type UserStatus = "active" | "suspended" | "deleted";

export interface User {
  id: string;
  external_id: string;
  email: string | null;
  phone_e164: string | null;
  status: UserStatus;
  created_at: string;
}

export interface Profile {
  id: string;
  external_id: string;
  user_id: string;
  handle: string;
  first_name: string;
  last_name: string | null;
  artist_name: string;
  artist_name_is_legal_name: boolean;
  display_name: string;
  genres: string[];
  city: string;
  country: string;
  bio: string | null;
  profile_photo_asset_id: string | null;
  dob: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  user: User;
  profile: Profile;
}

export interface SignupPayload {
  email: string | null;
  phone_e164: string | null;
  password: string;

  handle: string;
  first_name: string;
  last_name: string | null;
  artist_name: string;
  artist_name_is_legal_name: boolean;
  display_name: string;
  genres: string[];
  city: string;
  country: string;
  bio: string | null;
  dob: string | null; // YYYY-MM-DD
}

export interface LoginResponse {
  token: string;
  user: User;
  profile: Profile;
}

// GET /profiles returns a narrowed, public-safe subset of Profile (no dob,
// no user/auth fields) — Profile itself stays accurate for /auth/* routes.
export type DiscoverProfile = Omit<Profile, "dob">;

export type ProjectState =
  | "draft"
  | "funded"
  | "accepted"
  | "in_progress"
  | "delivered"
  | "buyer_rated"
  | "seller_rated"
  | "completed"
  | "cancelled"
  | "disputed";

export interface Project {
  id: string;
  external_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  title: string;
  requirements: string;
  price_amount: number; // integer minor units in `currency`, e.g. paise for INR, cents for USD
  currency: string;
  delivery_days: number;
  revision_limit: number;
  state: ProjectState;
  accepted_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  milestones_locked_at: string | null;
  // Optimistic-concurrency counter added by migration 010; commands send it back as expected_version.
  version?: number;
  created_at: string;
  updated_at: string;
}

export type MilestoneState =
  | "planned"
  | "funded"
  | "in_progress"
  | "delivered"
  | "buyer_approved"
  | "released"
  | "refunded"
  | "disputed"
  | "cancelled";

export interface ProjectMilestone {
  id: string;
  external_id: string;
  project_id: string;
  milestone_no: number;
  title: string;
  description: string | null;
  amount: number; // integer minor units in `currency`, e.g. paise for INR, cents for USD
  currency: string;
  due_at: string | null;
  state: MilestoneState;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectMilestonePayload {
  title: string;
  description: string | null;
  amount: number;
  due_at: string | null;
}

export interface CreateProjectPayload {
  seller_user_id: string;
  title: string;
  requirements: string;
  price_amount: number;
  delivery_days: number;
  revision_limit: number;
  milestones: CreateProjectMilestonePayload[];
}

export interface CreateProjectResponse {
  project: Project;
  milestones: ProjectMilestone[];
}

// The minimal collaborator identity carried alongside a project — present on
// every GET /projects row, but never on the plain POST /projects response.
export interface ProjectPartyProfile {
  user_id: string;
  display_name: string;
  handle: string;
  artist_name: string;
}

export interface ProjectWithParties extends Project {
  buyer_profile: ProjectPartyProfile;
  seller_profile: ProjectPartyProfile;
}


export type InvitationStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";

// Mirrors publicInvitation() in backend/src/projects/invitation-service.js.
export interface ProjectInvitation {
  external_id: string;
  project_id: string;
  project_external_id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  proposal_version: number;
  proposal_hash: string;
  status: InvitationStatus;
  expires_at: string;
  decided_at: string | null;
  withdrawn_at: string | null;
  version: number;
  project_version: number;
  created_at: string;
  updated_at: string;
}
