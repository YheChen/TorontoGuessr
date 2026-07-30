// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Behaviour of the navbar account control that is worth locking down.
 *
 * Two of these guard against real harm rather than cosmetics: the confirmation
 * before destroying an account that has no email, and the sign-in copy that must
 * not reveal whether an address already has an account.
 */

const getSession = vi.fn();
const onSessionChange = vi.fn((_handler: unknown) => () => undefined);
const sendMagicLink = vi.fn();
const signOut = vi.fn();
const fetchProfile = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  isAuthConfigured: true,
  getSession: () => getSession(),
  onSessionChange: (handler: unknown) => onSessionChange(handler as never),
  sendMagicLink: (email: string, token: string) => sendMagicLink(email, token),
  signOut: () => signOut(),
}));

vi.mock("@/lib/api", () => ({
  fetchProfile: () => fetchProfile(),
}));

// The real widget loads a Cloudflare script. Stand in for it with a button that
// hands back a token, so the flow after verification is what gets tested.
vi.mock("@/components/turnstile", () => ({
  isTurnstileConfigured: true,
  Turnstile: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken("test-captcha-token")}>
      solve captcha
    </button>
  ),
}));

// A static import is fine: vitest hoists vi.mock above the imports it affects.
import { AccountMenu } from "@/components/site/account-menu";

const anonymousSession = {
  accessToken: "token",
  userId: "user-1",
  isAnonymous: true,
  email: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(null);
  onSessionChange.mockReturnValue(() => undefined);
  sendMagicLink.mockResolvedValue({ error: null });
  fetchProfile.mockResolvedValue({ profile: { displayName: null } });
});

describe("AccountMenu, signed out", () => {
  it("offers sign in once the stored session has been read", async () => {
    render(<AccountMenu />);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("renders nothing before the session read resolves", () => {
    // Guards the flash: auth state lives in browser storage, so the first paint
    // knows nothing and must not claim the player is signed out.
    let resolve: (value: null) => void = () => undefined;
    getSession.mockReturnValue(new Promise<null>((r) => (resolve = r)));
    const { container } = render(<AccountMenu />);
    expect(container.innerHTML).toBe("");
    resolve(null);
  });

  it("sends a link and reports it without revealing whether the account exists", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(await screen.findByRole("button", { name: /sign in/i }));
    await user.type(await screen.findByLabelText(/email/i), "someone@example.com");
    await user.click(screen.getByRole("button", { name: /email me a link/i }));
    await user.click(await screen.findByRole("button", { name: /solve captcha/i }));

    await waitFor(() => {
      expect(sendMagicLink).toHaveBeenCalledWith(
        "someone@example.com",
        "test-captcha-token"
      );
    });

    const message = await screen.findByText(/on its way/i);
    // The wording has to stay conditional. shouldCreateUser is left true so an
    // unknown address behaves like a known one; confirming either here would
    // turn this form into an account-enumeration oracle.
    expect(message.textContent).toMatch(/if that address can be used/i);
    expect(message.textContent).not.toMatch(/welcome back|account found|no account/i);
  });

  it("surfaces a send failure instead of claiming success", async () => {
    const user = userEvent.setup();
    sendMagicLink.mockResolvedValue({ error: "Too many attempts." });
    render(<AccountMenu />);

    await user.click(await screen.findByRole("button", { name: /sign in/i }));
    await user.type(await screen.findByLabelText(/email/i), "someone@example.com");
    await user.click(screen.getByRole("button", { name: /email me a link/i }));
    await user.click(await screen.findByRole("button", { name: /solve captcha/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
    expect(screen.queryByText(/on its way/i)).toBeNull();
  });
});

describe("AccountMenu, signed in", () => {
  it("shows the display name once the profile loads", async () => {
    getSession.mockResolvedValue({ ...anonymousSession });
    fetchProfile.mockResolvedValue({ profile: { displayName: "Yanzhen" } });
    render(<AccountMenu />);
    expect(await screen.findByText("Yanzhen")).toBeTruthy();
  });

  it("still renders when the profile request fails", async () => {
    // The name is a nicety; a backend hiccup must not take out the navbar.
    getSession.mockResolvedValue({ ...anonymousSession });
    fetchProfile.mockRejectedValue(new Error("boom"));
    render(<AccountMenu />);
    expect(
      await screen.findByRole("button", { name: /account/i })
    ).toBeTruthy();
  });

  it("confirms before destroying an account that has no email", async () => {
    // The one that matters. An account with no email exists only as this
    // browser's session, so signing out is unrecoverable.
    const user = userEvent.setup();
    getSession.mockResolvedValue({ ...anonymousSession });
    render(<AccountMenu />);

    await user.click(await screen.findByRole("button", { name: /account/i }));
    await user.click(await screen.findByText(/sign out/i));

    expect(await screen.findByText(/will delete this account/i)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /sign out anyway/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("signs out directly when an email is attached", async () => {
    // Recoverable, so no confirmation is warranted.
    const user = userEvent.setup();
    getSession.mockResolvedValue({
      ...anonymousSession,
      isAnonymous: false,
      email: "me@example.com",
    });
    render(<AccountMenu />);

    await user.click(await screen.findByRole("button", { name: /account/i }));
    await user.click(await screen.findByText(/sign out/i));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/will delete this account/i)).toBeNull();
  });
});
