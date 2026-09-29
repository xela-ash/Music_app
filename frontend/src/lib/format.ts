// Formatting and parsing helpers shared by every screen. Money is always held
// as integer minor units (paise for INR) and never as a float.

export const TOKEN_KEY = "musicapp_token";

// Every project is stamped INR server-side (BR-PROJECTS-003).
export const PROJECT_CURRENCY = "INR";

// projects.price_amount and project_milestones.amount are PostgreSQL INTEGER.
export const POSTGRES_INT_MAX = 2147483647;

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

function localeForCurrency(currency: string): string {
  return currency === "INR" ? "en-IN" : "en-US";
}

export function formatMoney(minorUnits: number, currency: string = PROJECT_CURRENCY): string {
  return new Intl.NumberFormat(localeForCurrency(currency), { style: "currency", currency }).format(
    minorUnits / 100
  );
}

// Rupee string ("1500.5") to integer paise using integer arithmetic only.
export function parseMoneyToMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return minor > 0 ? minor : null;
}

export function parsePositiveInteger(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > 0 ? value : null;
}

export function parseNonNegativeIntegerOrDefault(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function formatDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// True when an ISO timestamp is already behind us. Kept out of components so
// render stays pure.
export function isPast(iso: string | null | undefined): boolean {
  return iso ? new Date(iso).getTime() < Date.now() : false;
}

export function getInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return letters.toUpperCase() || "?";
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Masks "ada@example.com" as "a••@example.com" for "check your email" screens.
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 1)}${"•".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
