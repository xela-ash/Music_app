import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "../domain/types";
import { NavContext } from "./context";
import type { Nav } from "./context";
import type { Route } from "./routes";

export function NavProvider({
  session,
  logout,
  initial = { name: "home" },
  children,
}: {
  session: Session;
  logout: () => void;
  initial?: Route;
  children: ReactNode;
}) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const [badgeVersion, setBadgeVersion] = useState(0);
  const route = stack[stack.length - 1];

  const go = useCallback((next: Route) => setStack((s) => [...s, next]), []);
  const replace = useCallback((next: Route) => setStack((s) => [...s.slice(0, -1), next]), []);
  const back = useCallback((fallback?: Route) => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : fallback ? [fallback] : s));
  }, []);
  const bumpBadges = useCallback(() => setBadgeVersion((v) => v + 1), []);

  const value = useMemo<Nav>(
    () => ({ route, go, replace, back, canGoBack: stack.length > 1, session, logout, bumpBadges, badgeVersion }),
    [route, go, replace, back, stack.length, session, logout, bumpBadges, badgeVersion]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

