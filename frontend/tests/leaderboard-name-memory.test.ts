// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetName,
  readRememberedName,
  rememberName,
} from "@/lib/leaderboard-name";

describe("remembering a leaderboard name", () => {
  // Just the one key, and defensively: whether window.localStorage is jsdom's own
  // Storage or the polyfill from tests/setup.ts differs between environments, and
  // a leftover value here makes every assertion below depend on file order.
  beforeEach(() => {
    try {
      window.localStorage.removeItem("tg_leaderboard_name");
    } catch {
      // Nothing to clean if storage is unavailable.
    }
  });

  it("round-trips a name", () => {
    rememberName("Yanzhen");
    expect(readRememberedName()).toBe("Yanzhen");
  });

  it("reports nothing when none was ever stored", () => {
    expect(readRememberedName()).toBeNull();
  });

  it("sanitises on the way in, so nothing unusable is ever stored", () => {
    rememberName("Yanzhen_Chen!!");
    expect(readRememberedName()).toBe("YanzhenChe");
  });

  it("sanitises on the way OUT as well", () => {
    // The value can be edited by hand in devtools. Reading it back through the
    // sanitiser means a tampered entry cannot produce a name the server refuses,
    // which would fail the auto-file silently on every future game.
    window.localStorage.setItem("tg_leaderboard_name", "not a valid name!!!!!!");
    expect(readRememberedName()).toBe("notavalidn");
  });

  it("stores nothing for a name with no usable characters", () => {
    rememberName("!!!");
    expect(readRememberedName()).toBeNull();
    expect(window.localStorage.getItem("tg_leaderboard_name")).toBeNull();
  });

  it("forgets on request", () => {
    rememberName("Yanzhen");
    forgetName();
    expect(readRememberedName()).toBeNull();
  });

  it("survives storage being blocked entirely", () => {
    // Safari in private mode throws on setItem. A player with storage disabled
    // must still be able to finish a game and name a score.
    //
    // The whole object is swapped rather than spied on. vi.spyOn behaved
    // differently between this machine and CI, because one has jsdom's real
    // Storage (methods on Storage.prototype) and the other the polyfill in
    // tests/setup.ts (methods as own properties), and the spy only bit on one of
    // them. Replacing the object outright depends on neither.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    const blocked = {
      get length(): number {
        throw new Error("SecurityError");
      },
      key: () => {
        throw new Error("SecurityError");
      },
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
      clear: () => {
        throw new Error("SecurityError");
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blocked,
    });

    try {
      expect(() => rememberName("Yanzhen")).not.toThrow();
      expect(readRememberedName()).toBeNull();
      expect(() => forgetName()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(window, "localStorage", original);
      }
    }
  });
});
