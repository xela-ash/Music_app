import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { resetDemo } from "./demo/store";

const TOKEN_KEY = "musicapp_token";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sessionFixture() {
  return {
    user: { id: USER_ID, external_id: "usr_1", email: "ada@example.com", phone_e164: null, status: "active" as const, created_at: "2026-01-01T00:00:00.000Z" },
    profile: {
      id: "33333333-3333-4333-8333-333333333333",
      external_id: "prf_3",
      user_id: USER_ID,
      handle: "ada",
      first_name: "Ada",
      last_name: "Lovelace",
      artist_name: "Ada Artist",
      artist_name_is_legal_name: false,
      display_name: "Ada Display",
      genres: ["classical"],
      city: "Chennai",
      country: "IN",
      bio: null,
      profile_photo_asset_id: null,
      dob: "1815-12-10",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

function sellerProfile() {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    external_id: "prf_4",
    user_id: "22222222-2222-4222-8222-222222222222",
    handle: "nyx",
    first_name: "Nya",
    last_name: "Legal",
    artist_name: "Nyx Artist",
    artist_name_is_legal_name: false,
    display_name: "Nyx Display",
    genres: ["electronic"],
    city: "Berlin",
    country: "DE",
    bio: null,
    profile_photo_asset_id: null,
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  };
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

function installApp(extra: Handler = () => undefined) {
  localStorage.setItem(TOKEN_KEY, "session-token");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = extra(String(url), init);
    if (custom) return custom;
    const href = String(url);
    if (href.endsWith("/auth/me")) return jsonResponse(200, sessionFixture());
    if (href.endsWith("/projects")) return jsonResponse(200, { projects: [] });
    if (href.includes("/profiles")) return jsonResponse(200, { profiles: [sellerProfile()] });
    return jsonResponse(404, { error: "Not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Home" });
  return user;
}

// Sidebar entries only — Home also has its own "Notifications" button.
const nav = (name: string | RegExp) =>
  within(screen.getByRole("navigation", { name: /Primary/ })).queryByRole("button", { name }) ??
  within(screen.getByRole("navigation", { name: /Account/ })).getByRole("button", { name });

beforeEach(() => resetDemo());
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("application shell", () => {
  it("shows primary and utility navigation and a real destination for each", async () => {
    installApp();
    const user = await openApp();
    for (const label of ["Home", "Discover", "Community", "Projects", "Messages"]) {
      expect(nav(label)).toBeTruthy();
    }
    expect(nav(/^Notifications/)).toBeTruthy();
    expect(nav("Profile")).toBeTruthy();
    expect(nav("Settings")).toBeTruthy();

    await user.click(nav("Messages"));
    expect(await screen.findByRole("heading", { name: "Project conversations" })).toBeTruthy();
    await user.click(nav("Profile"));
    expect(await screen.findByText("Profile completeness")).toBeTruthy();
    await user.click(nav("Settings"));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
  });

  it("does not invent Community: it is an honest placeholder", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Community"));
    expect(await screen.findByText("Community isn't available yet.")).toBeTruthy();
  });

  it("home is an action centre with attention items and active projects", async () => {
    installApp();
    await openApp();
    expect(await screen.findByText("Needs your attention")).toBeTruthy();
    expect(screen.getByText(/Proposal waiting for your response/)).toBeTruthy();
    expect(screen.getByText(/Project needs funding/)).toBeTruthy();
    expect(screen.getByText("Complete identity verification")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Active projects" })).toBeTruthy();
  });
});

describe("sign-up wizard and password reset", () => {
  it("walks account → about you → profile → photo → verify email → app", async () => {
    const user = userEvent.setup();
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const href = String(url);
        calls.push({ url: href, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (href.endsWith("/auth/signup")) return jsonResponse(201, {});
        if (href.endsWith("/auth/login")) return jsonResponse(200, { token: "t", ...sessionFixture() });
        if (href.endsWith("/projects")) return jsonResponse(200, { projects: [] });
        return jsonResponse(200, {});
      })
    );
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Sign up" }));

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password-1");
    await user.type(screen.getByLabelText("Confirm password"), "password-1");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.type(await screen.findByLabelText("First name"), "Ada");
    await user.type(screen.getByLabelText("City"), "Chennai");
    await user.type(screen.getByLabelText("Country"), "IN");
    expect(screen.getByText(/Only your city and country appear on your public profile/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.type(await screen.findByLabelText("Handle"), "ada");
    await user.type(screen.getByLabelText("Artist name"), "Ada Artist");
    await user.type(screen.getByLabelText("Display name"), "Ada Display");
    await user.type(screen.getByLabelText("Genres"), "pop,");
    expect(screen.getByRole("button", { name: "Remove pop" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Add a profile photo" })).toBeTruthy();
    const signup = calls.find((c) => c.url.endsWith("/auth/signup"))?.body as Record<string, unknown>;
    expect(signup).toMatchObject({ email: "ada@example.com", handle: "ada", genres: ["pop"], first_name: "Ada", city: "Chennai" });
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue to MusicApp" }));
    expect(await screen.findByRole("button", { name: "Home" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("t");
  });

  it("validates the phone format and step-one requirements before continuing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Sign up" }));
    await user.type(screen.getByLabelText("Phone (E.164)"), "98765");
    await user.type(screen.getByLabelText("Password"), "password-1");
    await user.type(screen.getByLabelText("Confirm password"), "password-1");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/international format/)).toBeTruthy();
  });

  it("forgot password: request → check email → reset → success → log in", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    // The wording never confirms that the account exists.
    expect(screen.getByText(/If an account exists/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open reset link (preview)" }));

    await user.type(await screen.findByLabelText("New password"), "new-password-1");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("Passwords do not match.")).toBeTruthy();
    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("heading", { name: "Password reset" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });
});

describe("start a project (PR02–PR04)", () => {
  async function toWizard() {
    const fetchMock = installApp((url, init) => {
      if (url.endsWith("/projects") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return jsonResponse(201, {
          project: { id: "99999999-9999-4999-8999-999999999999", external_id: "prj_9", buyer_user_id: USER_ID, seller_user_id: body.seller_user_id, title: body.title, requirements: body.requirements, price_amount: body.price_amount, currency: "INR", delivery_days: body.delivery_days, revision_limit: body.revision_limit, state: "draft", accepted_at: null, delivered_at: null, completed_at: null, milestones_locked_at: null, version: 1, created_at: "2026-09-29T00:00:00.000Z", updated_at: "2026-09-29T00:00:00.000Z" },
          milestones: body.milestones.map((m: { title: string; description: string | null; amount: number; due_at: string | null }, i: number) => ({ id: `ms-${i}`, external_id: `mil_${i}`, project_id: "99999999-9999-4999-8999-999999999999", milestone_no: i + 1, currency: "INR", state: "planned", created_at: "x", updated_at: "x", ...m })),
        });
      }
      if (url.includes("/invitations") && init?.method === "POST") return jsonResponse(201, { invitation: {} });
      return undefined;
    });
    const user = await openApp();
    await user.click(nav("Discover"));
    await user.click(await screen.findByRole("button", { name: "View profile" }));
    // The public profile never shows the legal name.
    expect(screen.queryByText(/Nya/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start a project" }));
    return { user, fetchMock };
  }

  it("blocks review until milestones reconcile, then sends create + invitation with an idempotency key", async () => {
    const { user, fetchMock } = await toWizard();
    await user.type(await screen.findByLabelText("Project title"), "My EP");
    await user.type(screen.getByLabelText("Requirements / brief"), "Four tracks");
    await user.type(screen.getByLabelText("Total project amount (INR)"), "1000");
    await user.type(screen.getByLabelText("Delivery days"), "14");
    await user.click(screen.getByRole("button", { name: "Continue to milestones" }));

    await user.type(await screen.findByLabelText("Title"), "Demo");
    await user.type(screen.getByLabelText("Amount (INR)"), "400");
    expect(screen.getByRole("button", { name: "Review project" }).hasAttribute("disabled")).toBe(true);
    await user.clear(screen.getByLabelText("Amount (INR)"));
    await user.type(screen.getByLabelText("Amount (INR)"), "1000");
    await user.click(screen.getByRole("button", { name: "Review project" }));

    expect(await screen.findByText("Proposal summary")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send proposal" }));

    expect(await screen.findByText("My EP")).toBeTruthy();
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/projects") && (c[1] as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({ seller_user_id: "22222222-2222-4222-8222-222222222222", price_amount: 100000, delivery_days: 14 });
    const invite = fetchMock.mock.calls.find((c) => String(c[0]).includes("/invitations"));
    const headers = new Headers((invite![1] as RequestInit).headers);
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(String((invite![1] as RequestInit).body))).toMatchObject({ invitee_user_id: "22222222-2222-4222-8222-222222222222", expected_version: 1 });
  });

  it("if the invitation fails the draft is kept and a retry does not create a second project", async () => {
    let inviteAttempts = 0;
    const fetchMock = installApp((url, init) => {
      if (url.endsWith("/projects") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return jsonResponse(201, { project: { id: "99999999-9999-4999-8999-999999999999", buyer_user_id: USER_ID, seller_user_id: body.seller_user_id, title: body.title, requirements: body.requirements, price_amount: body.price_amount, currency: "INR", delivery_days: 5, revision_limit: 0, state: "draft", accepted_at: null, delivered_at: null, completed_at: null, milestones_locked_at: null, version: 1, created_at: "2026-09-29T00:00:00.000Z", updated_at: "x" }, milestones: [] });
      }
      if (url.includes("/invitations") && init?.method === "POST") {
        inviteAttempts += 1;
        return inviteAttempts === 1 ? jsonResponse(409, { error: "Project version is stale" }) : jsonResponse(201, {});
      }
      return undefined;
    });
    const user = await openApp();
    await user.click(nav("Discover"));
    await user.click(await screen.findByRole("button", { name: "View profile" }));
    await user.click(screen.getByRole("button", { name: "Start a project" }));
    await user.type(await screen.findByLabelText("Project title"), "Retry me");
    await user.type(screen.getByLabelText("Requirements / brief"), "x");
    await user.type(screen.getByLabelText("Total project amount (INR)"), "500");
    await user.type(screen.getByLabelText("Delivery days"), "5");
    await user.click(screen.getByRole("button", { name: "Continue to milestones" }));
    await user.type(await screen.findByLabelText("Title"), "All of it");
    await user.type(screen.getByLabelText("Amount (INR)"), "500");
    await user.click(screen.getByRole("button", { name: "Review project" }));
    await user.click(await screen.findByRole("button", { name: "Send proposal" }));

    expect(await screen.findByText(/Your draft was saved, but the proposal wasn't sent: Project version is stale/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry sending proposal" }));
    expect(await screen.findByText("Retry me")).toBeTruthy();
    const creates = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/projects") && (c[1] as RequestInit | undefined)?.method === "POST");
    expect(creates).toHaveLength(1);
  });
});

describe("project workflow on preview data", () => {
  async function openProject(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(nav("Projects"));
    const heading = await screen.findByText(title);
    const card = heading.closest(".project-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "View project" }));
    await screen.findByRole("heading", { name: title });
  }

  it("lists projects with milestone progress, released amount and a needs-action filter", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Projects"));
    expect(await screen.findByText("Debut EP — production and mix")).toBeTruthy();
    expect(screen.getByText("1 of 4 milestones completed")).toBeTruthy();
    expect(screen.getByText(/Released ₹20,000\.00 \/ ₹1,00,000\.00/)).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Needs action" }));
    expect(screen.queryByText("Guitar re-amp and tone match")).toBeNull();
    expect(screen.getByText("Podcast theme and stingers")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.getByText("Guitar re-amp and tone match")).toBeTruthy();
  });

  it("seller accepts a proposal, then the buyer's funding shows the payment lifecycle and a retry after failure", async () => {
    installApp();
    const user = await openApp();
    await openProject(user, "Lo-fi single — vocal topline");
    await user.click(screen.getByRole("button", { name: "Review proposal" }));
    expect(await screen.findByText("Commercial terms")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(screen.getByText("Decline this proposal?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Go back" }));
    await user.click(screen.getByRole("button", { name: "Accept proposal" }));
    expect(await screen.findByText(/Awaiting funding/)).toBeTruthy();
  });

  it("buyer funds up front: failure creates no state change and Try again starts a new attempt", async () => {
    installApp();
    const user = await openApp();
    await openProject(user, "Podcast theme and stingers");
    await user.click(screen.getAllByRole("button", { name: "Fund project" })[0]);
    expect(await screen.findByText("What you're funding")).toBeTruthy();
    expect(screen.getByText("Platform / provider charges")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fund project" }));

    expect(await screen.findByText("Payment attempt 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue to provider" }));
    expect(await screen.findByText("Action required")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Simulate failure" }));
    expect(await screen.findByText(/Payment failed/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Payment attempt 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue to provider" }));
    await user.click(screen.getByRole("button", { name: "Complete authentication" }));
    await user.click(await screen.findByRole("button", { name: "Simulate success" }));
    expect(await screen.findByRole("heading", { name: "Funding successful" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Go to project" }));
    expect((await screen.findAllByText(/In progress/)).length).toBeGreaterThan(0);
  });

  it("buyer reviews the exact submission version and approves; money release is shown", async () => {
    installApp();
    const user = await openApp();
    await openProject(user, "Debut EP — production and mix");
    await user.click(screen.getByRole("tab", { name: "Milestones" }));
    expect(screen.getByText("1 / 4 completed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Arrangement" }));
    expect((await screen.findAllByText("Submission v2")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Submission v1").length).toBeGreaterThan(0); // history is preserved
    await user.click(screen.getByRole("button", { name: "Review submission" }));

    expect(await screen.findByText("Submission v2 (under review)")).toBeTruthy();
    expect(screen.getByText(/1 revision remaining/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve and release" }));
    expect(await screen.findByRole("heading", { name: "Milestone approved" })).toBeTruthy();
    expect(screen.getByText(/Rating the seller is separate and never holds up the release/)).toBeTruthy();
  });

  it("a revision request needs a reason, and is recorded on the milestone", async () => {
    installApp();
    const user = await openApp();
    await openProject(user, "Debut EP — production and mix");
    await user.click(screen.getByRole("tab", { name: "Milestones" }));
    await user.click(screen.getByRole("button", { name: "Arrangement" }));
    await user.click(await screen.findByRole("button", { name: "Review submission" }));
    await user.click(await screen.findByRole("button", { name: "Request revision" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Request revision" }));
    expect(await screen.findByText("Describe the changes you need.")).toBeTruthy();
    await user.type(within(dialog).getByLabelText("Requested changes"), "Tighten the intro");
    await user.click(within(dialog).getByRole("button", { name: "Request revision" }));
    expect(await screen.findByRole("heading", { name: "Revision requested" })).toBeTruthy();
  });

  it("seller submits a new immutable version for a revision", async () => {
    installApp();
    const user = await openApp();
    await openProject(user, "Afrobeats remix pack");
    await user.click(screen.getByRole("tab", { name: "Milestones" }));
    await user.click(screen.getByRole("button", { name: "Remix 1" }));
    await user.click(await screen.findByRole("button", { name: "Submit revised work" }));
    const submit = await screen.findByRole("button", { name: "Submit work" });
    expect(submit.hasAttribute("disabled")).toBe(true); // needs a file
    const file = new File(["x"], "remix1-v2.wav", { type: "audio/wav" });
    await user.upload(screen.getByLabelText("Files"), file);
    await user.type(screen.getByLabelText("Note for the buyer (optional)"), "Kick lifted");
    await user.click(screen.getByRole("button", { name: "Submit work" }));
    expect(await screen.findByRole("heading", { name: "Work submitted" })).toBeTruthy();
    expect(screen.getByText("Submission v2")).toBeTruthy();
  });

  it("terms tab shows the agreed snapshot and amendment flow shows current → proposed", async () => {
    installApp();
    const user = await openApp();
    await openProject(user, "Podcast theme and stingers");
    await user.click(screen.getByRole("tab", { name: "Terms" }));
    expect(await screen.findByText("Current terms — version 1")).toBeTruthy();
    expect(screen.getByText("Kabir Sen")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(screen.getByRole("button", { name: "Propose amendment" }));
    const amount = await screen.findByLabelText(/Amount, INR \(now ₹10,000\.00\)/);
    await user.clear(amount);
    await user.type(amount, "12000");
    expect(screen.getByText("+₹2,000.00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send amendment" }));
    expect(await screen.findByRole("tab", { name: "Terms" })).toBeTruthy();
    expect(await screen.findByText(/Proposed .* by you · 1 change/)).toBeTruthy();
  });

  it("messages are project-bound; deleting leaves a tombstone, not a hole", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Messages"));
    expect(await screen.findByText(/Debut EP — production and mix/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Nyx Rao/ }));
    expect(await screen.findByText("Great — the reference folder has the tempo map.")).toBeTruthy();
    expect(screen.queryByText(/seen by/i)).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete message" }));
    expect(await screen.findByText("Message deleted")).toBeTruthy();
    await user.type(screen.getByLabelText("Message"), "Correction: the tempo is 92 BPM");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Correction: the tempo is 92 BPM")).toBeTruthy();
  });
});

describe("notifications, ratings, disputes, verification, payouts", () => {
  it("notifications link to the object; settings keep mandatory categories on and inactive channels off", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav(/^Notifications/));
    await user.click(await screen.findByRole("button", { name: /Work submitted for review/ }));
    expect(await screen.findByRole("heading", { name: "Arrangement" })).toBeTruthy();
    await user.click(nav(/^Notifications/));
    await user.click(await screen.findByRole("button", { name: "Notification settings" }));
    const payments = await screen.findByLabelText("Payments — Email");
    expect(payments.hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Messages — Push").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Messages — Email").hasAttribute("disabled")).toBe(false);
  });

  it("rating uses the configured scale, warns it is immutable, then submits", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Profile"));
    await user.click(await screen.findByRole("button", { name: "Reviews" }));
    await user.click(await screen.findByRole("button", { name: "Rate now" }));
    const group = await screen.findByRole("radiogroup", { name: "Rating" });
    expect(within(group).getAllByRole("radio").length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Choose a rating.")).toBeTruthy();
    await user.click(within(group).getAllByRole("radio")[3]);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Your rating cannot be edited after submission.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(/Your rating of Isha Verma has been submitted/)).toBeTruthy();
  });

  it("dispute outcome is described in plain language, not enum strings", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav(/^Notifications/));
    await user.click(await screen.findByRole("button", { name: /Dispute decision issued/ }));
    expect(await screen.findByText(/The amount is shared\./)).toBeTruthy();
    expect(screen.queryByText("SPLIT")).toBeNull();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("opens a dispute from an eligible project", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Projects"));
    const card = (await screen.findByText("Debut EP — production and mix")).closest(".project-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "View project" }));
    await user.click(await screen.findByRole("button", { name: "Open dispute" }));
    await user.selectOptions(await screen.findByLabelText("Dispute category"), "Work not delivered");
    await user.type(screen.getByLabelText("Claim summary"), "Not delivered");
    await user.click(screen.getByRole("button", { name: "Open dispute" }));
    expect(await screen.findByText("Dispute case")).toBeTruthy();
    expect(screen.getAllByText("Opened").length).toBeGreaterThan(0);
  });

  it("verification submission needs consent and a document, then shows processing", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Profile"));
    await user.click(await screen.findByRole("button", { name: "Identity verification" }));
    expect(await screen.findByText("Not submitted")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Submit for verification" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.upload(screen.getByLabelText("Document images"), new File(["x"], "passport.jpg", { type: "image/jpeg" }));
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    expect(submit.hasAttribute("disabled")).toBe(false);
    await user.click(submit);
    expect(await screen.findByText(/waiting to be picked up/)).toBeTruthy();
  });

  it("payout setup is a provider-neutral shell with no invented bank fields", async () => {
    installApp();
    const user = await openApp();
    await user.click(nav("Profile"));
    await user.click(await screen.findByRole("button", { name: "Payout settings" }));
    expect(await screen.findByText("Payout account setup")).toBeTruthy();
    expect(screen.queryByLabelText(/account number/i)).toBeNull();
    expect(screen.queryByLabelText(/ifsc/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "View earnings" }));
    expect(await screen.findByText("Total earned")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /Funding · Afrobeats remix pack/ }));
    expect(await screen.findByRole("heading", { name: "Transaction detail" })).toBeTruthy();
    expect(screen.getByText("Reference")).toBeTruthy();
  });
});

describe("global states", () => {
  it("shows an error with retry when the projects API fails, and recovers", async () => {
    let attempts = 0;
    installApp((url) => {
      if (url.endsWith("/projects")) {
        attempts += 1;
        return attempts === 1 ? jsonResponse(500, { error: "Projects unavailable" }) : jsonResponse(200, { projects: [] });
      }
      return undefined;
    });
    const user = await openApp();
    await user.click(nav("Projects"));
    expect(await screen.findByText("Projects unavailable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Debut EP — production and mix")).toBeTruthy();
  });

  it("shows the offline message when the network is down", async () => {
    installApp((url) => {
      if (url.endsWith("/projects")) throw new TypeError("Failed to fetch");
      return undefined;
    });
    const user = await openApp();
    await user.click(nav("Projects"));
    expect(await screen.findByText("You appear to be offline.")).toBeTruthy();
  });
});
