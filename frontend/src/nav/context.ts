import { createContext, useContext } from "react";
import type { Session } from "../domain/types";
import type { Route } from "./routes";

export interface Nav {
  route: Route;
  go: (route: Route) => void;
  replace: (route: Route) => void;
  back: (fallback?: Route) => void;
  canGoBack: boolean;
  session: Session;
  logout: () => void;
  // Lets screens that change unread counts ask the shell to refresh its badges.
  bumpBadges: () => void;
  badgeVersion: number;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used inside <NavProvider>");
  return ctx;
}

