import * as demo from "../../demo/store";
import type { HubProject } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { listLiveProjects } from "../../lib/liveApi";

// Real projects come from GET /projects (which has no milestone data yet) and
// are registered with the preview layer so the hub can open them.
export async function loadProjects(session: Session): Promise<HubProject[]> {
  const live = await listLiveProjects();
  live.forEach((p) => {
    const buyerIsMe = p.buyer_user_id === session.user.id;
    demo.adoptLiveProject(p, null, buyerIsMe ? demo.partyFromSession(session) : p.buyer_profile, buyerIsMe ? p.seller_profile : demo.partyFromSession(session));
  });
  return demo.listProjects();
}
