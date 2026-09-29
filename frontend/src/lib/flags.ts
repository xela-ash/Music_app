// The internal operations screens (ADM01–ADM05) run on preview data and have no
// role model behind them yet (there is no roles table — Build Record §4.x), so
// they're hidden unless explicitly switched on. Hiding is a usability measure
// only; real access control belongs to the backend.
export function adminPreviewEnabled(): boolean {
  try {
    return import.meta.env.VITE_ADMIN_PREVIEW === "on" || localStorage.getItem("musicapp_admin_preview") === "1";
  } catch {
    return import.meta.env.VITE_ADMIN_PREVIEW === "on";
  }
}
