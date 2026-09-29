// Typed wrappers over the API calls that exist on the backend today, so
// screens never build request bodies or pull the token themselves.
import { apiGet, apiPost } from "../api/api";
import type {
  CreateProjectPayload,
  CreateProjectResponse,
  ProjectInvitation,
  ProjectWithParties,
} from "../domain/types";
import { TOKEN_KEY } from "./format";

export function getToken(): string | undefined {
  return localStorage.getItem(TOKEN_KEY) ?? undefined;
}

export async function createDraftProject(payload: CreateProjectPayload): Promise<CreateProjectResponse> {
  return (await apiPost("/projects", payload, getToken())) as CreateProjectResponse;
}

export async function listLiveProjects(): Promise<ProjectWithParties[]> {
  const data = (await apiGet("/projects", getToken())) as { projects: ProjectWithParties[] };
  return data.projects;
}

export async function lockMilestones(projectId: string) {
  return (await apiPost(`/projects/${projectId}/lock-milestones`, {}, getToken())) as {
    project: import("../domain/types").Project;
    milestones: import("../domain/types").ProjectMilestone[];
  };
}

// Sends the proposal: POST /projects/:id/invitations. The server requires an
// Idempotency-Key and the project's current version.
export async function inviteSeller(projectId: string, inviteeUserId: string, expectedVersion: number, expiresInDays = 7) {
  const expires = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  return (await apiPost(
    `/projects/${projectId}/invitations`,
    { invitee_user_id: inviteeUserId, expires_at: expires, expected_version: expectedVersion },
    getToken(),
    { "Idempotency-Key": crypto.randomUUID() }
  )) as { invitation?: ProjectInvitation } & Partial<ProjectInvitation>;
}
