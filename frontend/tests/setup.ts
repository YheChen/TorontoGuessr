import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Shared test setup, applied to every suite.
 *
 * Most suites run in the node environment and have no DOM, so everything that
 * touches one is guarded. Deliberately no jest-dom: its matchers need a
 * TypeScript augmentation to typecheck, and the handful of assertions that
 * wanted them read just as clearly against `.disabled` and `.innerHTML`. One
 * less dependency and one less way for `npm test` and `tsc` to disagree.
 */

afterEach(() => {
  // With `globals: false` this is not automatic. Without it, React trees from
  // earlier tests stay in the document and queries match stale nodes, which
  // shows up as tests that pass alone and fail in a suite.
  if (typeof document !== "undefined") {
    cleanup();
    // Same reasoning for storage: a remembered name left behind by one suite
    // would make the next one pass or fail depending on file order.
    try {
      window.localStorage.clear();
    } catch {
      // A suite may have deliberately broken storage to test that path.
    }
  }
});

if (typeof document !== "undefined") {
  // jsdom implements none of these, and Radix primitives call them while
  // positioning a popover or restoring focus. Missing them surfaces as an opaque
  // "not a function" inside a component that works fine in a browser.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  }

  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }

  // jsdom 29 under this vitest environment exposes window.localStorage as a plain
  // object: its prototype is Object.prototype, not Storage, so getItem is
  // undefined and any call throws "not a function". That is worth stating because
  // it means storage-backed code was not merely untested, it was UNTESTABLE, and a
  // suite that touched it failed for a reason that looked like a bug in the code.
  //
  // Replaced with a real Storage-shaped object over a Map. Reset in afterEach
  // below so one suite cannot leak a value into the next.
  const needsStorage =
    typeof window.localStorage !== "object" ||
    window.localStorage === null ||
    typeof (window.localStorage as Partial<Storage>).getItem !== "function";

  if (needsStorage) {
    const entries = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(String(key)) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(String(key), String(value));
      },
      removeItem: (key: string) => {
        entries.delete(String(key));
      },
      clear: () => {
        entries.clear();
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: storage,
    });
  }

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
}
