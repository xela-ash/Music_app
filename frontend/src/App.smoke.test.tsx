import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const TOKEN_KEY = "musicapp_token";

afterEach(() => {
  cleanup();
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

describe("MVP-002 auth screen smoke", () => {
  it("renders the logged-out login screen with empty fields and no error", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "MusicApp" })).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Loading session…")).toBeNull();
    expect(document.querySelector(".error-message")).toBeNull();
  });

  it("shows a validation message when signup passwords do not match", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Sign up" }));
    await user.type(screen.getByLabelText("Password"), "password-1");
    await user.type(screen.getByLabelText("Confirm password"), "password-2");

    const form = screen.getByRole("button", { name: "Create account" }).closest("form");
    if (!form) {
      throw new Error("signup form was not rendered");
    }
    fireEvent.submit(form);

    expect(await screen.findByText("Passwords do not match.")).toBeTruthy();
  });

  it("shows a loading state, then the logged-out screen, when a saved session is rejected", async () => {
    localStorage.setItem(TOKEN_KEY, "stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: "Unauthorized" }))
    );

    render(<App />);

    expect(screen.getByText("Loading session…")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "MusicApp" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("shows the server error when login is rejected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: "Invalid email or password" }))
    );

    render(<App />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password-1");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid email or password")).toBeTruthy();
    expect(screen.queryByText("Loading session…")).toBeNull();
  });
});
