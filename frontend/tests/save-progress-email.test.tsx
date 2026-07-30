// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The attach-email section of the game summary.
 *
 * The point of these tests is the wording. updateUser does not move an address
 * onto the account until the confirmation link is opened, so telling someone
 * they are upgraded when they are not would make them stop worrying about a
 * browser whose data still holds their only key. That is a data-loss bug dressed
 * as a copy nit, and it is exactly the kind of thing a reader skims past.
 */

const getSession = vi.fn();
const attachEmail = vi.fn();
const fetchProfile = vi.fn();
const updateDisplayName = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  isAuthConfigured: true,
  getSession: () => getSession(),
  signInAnonymously: vi.fn(),
  attachEmail: (email: string) => attachEmail(email),
}));

vi.mock("@/lib/api", () => ({
  fetchProfile: () => fetchProfile(),
  updateDisplayName: (name: string) => updateDisplayName(name),
}));

vi.mock("@/components/turnstile", () => ({
  isTurnstileConfigured: true,
  Turnstile: () => <div>captcha</div>,
}));

// A static import is fine: vitest hoists vi.mock above the imports it affects.
import { SaveProgress } from "@/components/save-progress";

const session = (email: string | null) => ({
  accessToken: "token",
  userId: "user-1",
  isAnonymous: email === null,
  email,
});

beforeEach(() => {
  vi.clearAllMocks();
  attachEmail.mockResolvedValue({ error: null });
  fetchProfile.mockResolvedValue({
    profile: { displayName: "Yanzhen", currentStreak: 3 },
  });
});

describe("SaveProgress, attaching an email", () => {
  it("offers the form while the account has no email", async () => {
    getSession.mockResolvedValue(session(null));
    render(<SaveProgress />);

    expect(await screen.findByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByText(/lives only in this browser/i)).toBeTruthy();
  });

  it("replaces the form with a status line once an email is attached", async () => {
    // Recovery already works, so offering to add another is only a way to lose
    // the first.
    getSession.mockResolvedValue(session("me@example.com"));
    render(<SaveProgress />);

    expect(await screen.findByText(/reachable at me@example.com/i)).toBeTruthy();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
  });

  it("reports that a confirmation was sent, not that the account is upgraded", async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue(session(null));
    render(<SaveProgress />);

    await user.type(await screen.findByLabelText(/email/i), "me@example.com");
    await user.click(screen.getByRole("button", { name: /add email/i }));

    await waitFor(() => expect(attachEmail).toHaveBeenCalledWith("me@example.com"));

    const message = await screen.findByText(/confirmation sent/i);
    expect(message.textContent).toMatch(/open the link/i);
    // Must not imply the work is finished.
    expect(message.textContent).not.toMatch(/added successfully|upgraded|you can now sign in/i);
  });

  it("keeps the button disabled until the address is plausible", async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue(session(null));
    render(<SaveProgress />);

    const button = (await screen.findByRole("button", {
      name: /add email/i,
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await user.type(await screen.findByLabelText(/email/i), "not-an-email");
    expect(button.disabled).toBe(true);

    await user.type(await screen.findByLabelText(/email/i), "@example.com");
    expect(button.disabled).toBe(false);
  });

  it("shows a rejected address as a failure rather than a success", async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue(session(null));
    attachEmail.mockResolvedValue({
      error: "That email is already linked to another account.",
    });
    render(<SaveProgress />);

    await user.type(await screen.findByLabelText(/email/i), "taken@example.com");
    await user.click(screen.getByRole("button", { name: /add email/i }));

    expect(await screen.findByText(/already linked to another account/i)).toBeTruthy();
    expect(screen.queryByText(/confirmation sent/i)).toBeNull();
  });
});
