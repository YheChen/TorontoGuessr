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
