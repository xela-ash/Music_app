import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const TOKEN_KEY = "musicapp_token";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sessionFixture() {
  return {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      external_id: "usr_11111111111111111111",
      email: "ada@example.com",
      phone_e164: null,
      status: "active" as const,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    profile: {
      id: "33333333-3333-4333-8333-333333333333",
      external_id: "prf_33333333333333333333",
      user_id: "11111111-1111-4111-8111-111111111111",
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

function discoverProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    external_id: "prf_44444444444444444444",
    user_id: "22222222-2222-4222-8222-222222222222",
    handle: "nyx",
    first_name: "Nya",
    last_name: "Example",
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
    ...overrides,
  };
}

function installSession(fetchMock: ReturnType<typeof vi.fn>) {
  localStorage.setItem(TOKEN_KEY, "session-token");
  vi.stubGlobal("fetch", fetchMock);
}

describe("MVP-013 discover search", () => {
  it("shows loading, then server results, and hides the signed-in profile", async () => {
    const user = userEvent.setup();
    let releaseProfiles: (response: Response) => void = () => {};
    const profilesPending = new Promise<Response>((resolve) => {
      releaseProfiles = resolve;
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return jsonResponse(200, sessionFixture());
      }
      return profilesPending;
    });
    installSession(fetchMock);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Discover" }));

    expect(screen.getByText("Finding collaborators...")).toBeTruthy();
    releaseProfiles(
      jsonResponse(200, {
        profiles: [
          discoverProfile(),
          discoverProfile({
            id: "55555555-5555-4555-8555-555555555555",
            user_id: "11111111-1111-4111-8111-111111111111",
            display_name: "Ada Display",
            handle: "ada",
          }),
        ],
      })
    );
    expect(await screen.findByText("Nyx Display")).toBeTruthy();
    const grid = document.querySelector(".profile-grid");
    expect(grid?.textContent).toContain("Nyx Display");
    expect(grid?.textContent).not.toContain("Ada Display");
    const profileCall = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes("/profiles"));
    expect(profileCall).toBe("http://localhost:4000/profiles");
  });

  it("shows the empty catalog and the empty search state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return jsonResponse(200, sessionFixture());
      }
      const href = String(url);
      if (href.includes("name=")) {
        return jsonResponse(200, { profiles: [] });
      }
      return jsonResponse(200, { profiles: [] });
    });
    installSession(fetchMock);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Discover" }));
    expect(await screen.findByText("No collaborators found yet.")).toBeTruthy();

    await user.type(
      screen.getByRole("searchbox", { name: "Search by name, handle, genre or location" }),
      "nyx"
    );
    expect(await screen.findByText("No profiles match your search.")).toBeTruthy();
  });

  it("sends the search text on every discover dimension and renders the match", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/auth/me")) {
        return jsonResponse(200, sessionFixture());
      }
      if (href.includes("name=nyx")) {
        return jsonResponse(200, { profiles: [discoverProfile()] });
      }
      void init;
      return jsonResponse(200, { profiles: [] });
    });
    installSession(fetchMock);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Discover" }));
    await screen.findByText("No collaborators found yet.");

    await user.type(
      screen.getByRole("searchbox", { name: "Search by name, handle, genre or location" }),
      "nyx"
    );

    expect(await screen.findByText("Nyx Display")).toBeTruthy();
    const searched = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("name=nyx"));
    expect(searched.length).toBeGreaterThan(0);
    const latest = new URL(searched[searched.length - 1]);
    expect(latest.searchParams.get("name")).toBe("nyx");
    expect(latest.searchParams.get("handle")).toBe("nyx");
    expect(latest.searchParams.get("genre")).toBe("nyx");
    expect(latest.searchParams.get("city")).toBe("nyx");
    expect(latest.searchParams.get("country")).toBe("nyx");
    const init = fetchMock.mock.calls.find((call) => String(call[0]).includes("name=nyx"))?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer session-token");
  });

  it("shows the server error and retries the search", async () => {
    const user = userEvent.setup();
    let profileAttempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return jsonResponse(200, sessionFixture());
      }
      profileAttempts += 1;
      if (profileAttempts === 1) {
        return jsonResponse(500, { error: "Search unavailable" });
      }
      return jsonResponse(200, { profiles: [discoverProfile()] });
    });
    installSession(fetchMock);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Discover" }));
    expect(await screen.findByText("Search unavailable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nyx Display")).toBeTruthy();
  });
});
