import { describe, expect, it } from "vitest";
import { readAuthCallback } from "@/lib/auth-callback";

describe("readAuthCallback", () => {
  it("reads implicit-flow tokens from the hash", () => {
    // What the default flowType actually produces.
    const hash =
      "#access_token=eyJhbGc.payload.sig&expires_in=3600&refresh_token=abc&token_type=bearer&type=magiclink";
    expect(readAuthCallback("", hash)).toEqual({ kind: "tokens" });
  });

  it("reads a PKCE code from the query string", () => {
    expect(readAuthCallback("?code=abc123", "")).toEqual({
      kind: "code",
      code: "abc123",
    });
  });

  it("reports nothing when the URL is bare", () => {
    expect(readAuthCallback("", "")).toEqual({ kind: "none" });
    expect(readAuthCallback("?utm_source=email", "#")).toEqual({ kind: "none" });
  });

  it("rewords an expired link", () => {
    const result = readAuthCallback(
      "",
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
    );
    expect(result.kind).toBe("error");
    expect(result).toMatchObject({ message: expect.stringContaining("expired") });
  });

  it("finds errors in the query string as well as the hash", () => {
    const result = readAuthCallback("?error=access_denied", "");
    expect(result.kind).toBe("error");
  });

  it("falls back to the server's description for an unknown code", () => {
    const result = readAuthCallback(
      "?error_code=some_new_code&error_description=Something+specific+happened",
      ""
    );
    expect(result).toEqual({
      kind: "error",
      message: "Something specific happened",
    });
  });

  it("never returns an empty error message", () => {
    const result = readAuthCallback("?error=", "#error_description=");
    expect(result.kind).toBe("error");
    expect((result as { message: string }).message.length).toBeGreaterThan(0);
  });

  it("prefers an error over a code that arrived alongside it", () => {
    // Treating such a link as success would strand the player on a page that
    // silently did nothing.
    const result = readAuthCallback("?code=abc123&error_code=otp_expired", "");
    expect(result.kind).toBe("error");
  });

  it("prefers an error in the hash over tokens in the hash", () => {
    const result = readAuthCallback(
      "",
      "#access_token=x&error_code=otp_expired"
    );
    expect(result.kind).toBe("error");
  });
});
