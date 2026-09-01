import { describe, expect, it } from "vitest";
import { totalsOf } from "@/lib/totals";
import { EMPTY_METRICS, type LinkResult, type Metrics, type Platform } from "@/lib/types";

function link(platform: Platform, metrics: Partial<Metrics>, status: LinkResult["status"] = "ok"): LinkResult {
  return {
    id: Math.random().toString(),
    platform,
    originalUrl: "u",
    canonicalUrl: "u",
    externalId: null,
    contentType: "REEL",
    creatorHint: null,
    source: "paste",
    sheet: null,
    row: null,
    creator: null,
    creatorId: null,
    title: null,
    postedAt: null,
    metrics: { ...EMPTY_METRICS, ...metrics },
    status,
    note: null,
    provider: "test",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("totalsOf", () => {
  it("sums only the links that reported a metric", () => {
    const totals = totalsOf([
      link("INSTAGRAM", { views: 100, likes: 10 }),
      link("INSTAGRAM", { views: 200 }),
    ]);

    expect(totals.metrics.views).toEqual({ total: 300, available: 2, of: 2 });
    expect(totals.metrics.likes).toEqual({ total: 10, available: 1, of: 2 });
  });

  it("reports null rather than zero when nothing supplied a metric", () => {
    const totals = totalsOf([link("YOUTUBE", { views: 5 })]);
    expect(totals.metrics.shares.total).toBeNull();
    expect(totals.metrics.shares.available).toBe(0);
  });

  it("counts links per platform", () => {
    const totals = totalsOf([
      link("INSTAGRAM", {}),
      link("INSTAGRAM", {}),
      link("YOUTUBE", {}),
    ]);
    expect(totals.byPlatform).toEqual({ INSTAGRAM: 2, YOUTUBE: 1, FACEBOOK: 0 });
    expect(totals.links).toBe(3);
  });

  it("counts links that returned nothing", () => {
    const totals = totalsOf([
      link("INSTAGRAM", { views: 1 }),
      link("INSTAGRAM", {}, "unavailable"),
      link("FACEBOOK", {}, "error"),
    ]);
    expect(totals.failed).toBe(2);
  });

  it("handles an empty result set", () => {
    const totals = totalsOf([]);
    expect(totals.links).toBe(0);
    expect(totals.metrics.views).toEqual({ total: null, available: 0, of: 0 });
  });
});
