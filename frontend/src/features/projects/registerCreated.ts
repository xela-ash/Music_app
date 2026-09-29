import * as demo from "../../demo/store";
import type { DiscoverProfile, Project, ProjectMilestone, Session } from "../../domain/types";

// Registers the freshly created live project with the hub layer.
export function registerCreatedProject(session: Session, seller: DiscoverProfile, project: Project, milestones: ProjectMilestone[]) {
  demo.adoptLiveProject(project, milestones, demo.partyFromSession(session), {
    user_id: seller.user_id,
    display_name: seller.display_name,
    handle: seller.handle,
    artist_name: seller.artist_name,
  });
  demo.markProposalSent(project.id);
}
