import { describe, expect, it } from "vitest";
import { midpoint } from "@/lib/map-geometry";

describe("midpoint", () => {
  it("lands halfway between two Toronto points", () => {
    expect(midpoint({ lat: 43.6, lng: -79.4 }, { lat: 43.7, lng: -79.3 })).toEqual({
      lat: 43.650000000000006,
      lng: -79.35,
    });
  });

  it("returns the point itself when both are the same", () => {
    // A perfect guess puts the pin on the answer, so the label anchors there
    // rather than at a NaN or an offset position.
    const point = { lat: 43.6532, lng: -79.3832 };
    expect(midpoint(point, point)).toEqual(point);
  });

  it("is order independent", () => {
    const a = { lat: 43.61, lng: -79.51 };
    const b = { lat: 43.79, lng: -79.22 };
    expect(midpoint(a, b)).toEqual(midpoint(b, a));
  });

  it("stays between the two inputs on both axes", () => {
    const a = { lat: 43.58, lng: -79.63 };
    const b = { lat: 43.85, lng: -79.11 };
    const mid = midpoint(a, b);
    expect(mid.lat).toBeGreaterThan(a.lat);
    expect(mid.lat).toBeLessThan(b.lat);
    expect(mid.lng).toBeGreaterThan(a.lng);
    expect(mid.lng).toBeLessThan(b.lng);
  });

  it("handles the negative longitudes this city actually uses", () => {
    // Averaging two negatives must stay negative. Getting a sign wrong here would
    // put every label in China.
    const mid = midpoint({ lat: 43.6, lng: -79.5 }, { lat: 43.7, lng: -79.2 });
    expect(mid.lng).toBeLessThan(0);
    expect(mid.lng).toBeCloseTo(-79.35, 10);
  });
});
