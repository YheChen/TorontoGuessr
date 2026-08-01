// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetName,
  readRememberedName,
  rememberName,
} from "@/lib/leaderboard-name";

describe("remembering a leaderboard name", () => {
  // removeItem on the one key, not clear(): jsdom's Storage here has no clear(),
  // and a test should not be wiping storage it does not own anyway.
  beforeEach(() => {
    window.localStorage.removeItem("tg_leaderboard_name");
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
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const getItem = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(() => rememberName("Yanzhen")).not.toThrow();
    expect(readRememberedName()).toBeNull();

    setItem.mockRestore();
    getItem.mockRestore();
  });
});
