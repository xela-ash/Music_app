import * as demo from "../../demo/store";
import type { Profile, Session } from "../../domain/types";

// The session profile with any edits made in Edit profile applied on top.
export function effectiveProfile(session: Session): Profile {
  return { ...session.profile, ...(demo.getProfileOverrides() ?? {}) };
}
