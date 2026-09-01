import { describe, expect, it } from "vitest";
import { creatorKey, creatorsIn } from "@/lib/creators";
import { resolveCreatorInput } from "@/lib/creators/resolve";
import { summarise } from "@/lib/creators/types";
import { buildCsv } from "@/lib/export";
import { EMPTY_METRICS, type CreatorStats, type LinkResult } from "@/lib/types";

function link(overrides: Partial<LinkResult>): LinkResult {
  return {
    id: overrides.canonicalUrl ?? "id",
    platform: "INSTAGRAM",
    originalUrl: "https://www.instagram.com/reel/AAA/",
    canonicalUrl: "https://www.instagram.com/reel/AAA/",
    externalId: "AAA",
    contentType: "REEL",
    creatorHint: null,
    source: "paste",
    sheet: null,
    row: null,
    creator: "@nasa",
    creatorId: "nasa",
    title: null,
    postedAt: null,
    metrics: { ...EMPTY_METRICS },
    status: "ok",
    note: null,
    provider: "test",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("creator selection", () => {
  it("returns each creator once, even across many links", () => {
    const creators = creatorsIn([
      link({ canonicalUrl: "a" }),
      link({ canonicalUrl: "b" }),
      link({ canonicalUrl: "c", creatorId: "esa" }),
    ]);

    expect(creators).toEqual([
      { platform: "INSTAGRAM", creatorId: "nasa" },
      { platform: "INSTAGRAM", creatorId: "esa" },
    ]);
  });

  it("separates the same handle on different platforms", () => {
    const creators = creatorsIn([
      link({ canonicalUrl: "a" }),
      link({ canonicalUrl: "b", platform: "YOUTUBE" }),
    ]);
    expect(creators).toHaveLength(2);
  });

  it("skips links with no creator id", () => {
    expect(creatorsIn([link({ creatorId: null })])).toEqual([]);
  });
});

describe("summarise", () => {
  const videos = [
    { views: 100, likes: 10, comments: 2 },
    { views: 200, likes: 20, comments: 4 },
  ];

  it("averages the sample and computes engagement against followers", () => {
    const stats = summarise("INSTAGRAM", "nasa", videos, {
      displayName: "NASA",
      profileUrl: null,
      followers: 1000,
      provider: "test",
    });

    expect(stats.avgViews).toBe(150);
    expect(stats.avgLikes).toBe(15);
    expect(stats.avgComments).toBe(3);
    // (15 + 3) / 1000 = 1.8%
    expect(stats.engagementRate).toBeCloseTo(1.8);
    // (15 + 3) / 150 = 12%
    expect(stats.engagementByViews).toBeCloseTo(12);
    expect(stats.sampleSize).toBe(2);
    expect(stats.status).toBe("ok");
  });

  it("still reports engagement against views when the follower count is unknown", () => {
    const stats = summarise("INSTAGRAM", "nasa", videos, {
      displayName: null,
      profileUrl: null,
      followers: null,
      provider: "test",
    });

    expect(stats.engagementRate).toBeNull();
    expect(stats.engagementByViews).toBeCloseTo(12);
  });

  it("says how few posts the like average is really over when the rest are hidden", () => {
    const stats = summarise(
      "INSTAGRAM",
      "hidden",
      [
        { views: 100, likes: 40, comments: 1 },
        { views: 100, likes: null, comments: 1 },
        { views: 100, likes: null, comments: 1 },
      ],
      { displayName: null, profileUrl: null, followers: 1000, provider: "test" },
    );

    expect(stats.avgLikes).toBe(40);
    expect(stats.note).toContain("likes are hidden on 2 of the last 3");
    expect(stats.status).toBe("partial");
  });

  it("reads a rate above 100% as real when reach outruns the follower count", () => {
    const stats = summarise("INSTAGRAM", "viral", [{ views: 1_741_738, likes: 88_081, comments: 877 }], {
      displayName: null,
      profileUrl: null,
      followers: 67_736,
      provider: "test",
    });

    expect(stats.engagementRate).toBeCloseTo(131.33, 1);
    expect(stats.engagementByViews).toBeCloseTo(5.11, 1);
  });

  it("reports no engagement rate when followers are unknown", () => {
    const stats = summarise("INSTAGRAM", "nasa", videos, {
      displayName: null,
      profileUrl: null,
      followers: null,
      provider: "test",
    });

    expect(stats.engagementRate).toBeNull();
    expect(stats.status).toBe("partial");
    expect(stats.note).toContain("follower count unavailable");
  });

  it("ignores videos missing a metric rather than counting them as zero", () => {
    const stats = summarise(
      "YOUTUBE",
      "UC1",
      [
        { views: 100, likes: 10, comments: null },
        { views: 200, likes: null, comments: null },
      ],
      { displayName: null, profileUrl: null, followers: 100, provider: "test" },
    );

    expect(stats.avgLikes).toBe(10);
    expect(stats.avgComments).toBeNull();
  });

  it("returns null averages and a reason when nothing was returned", () => {
    const stats = summarise("INSTAGRAM", "ghost", [], {
      displayName: null,
      profileUrl: null,
      followers: 50,
      provider: "test",
    });

    expect(stats.avgViews).toBeNull();
    expect(stats.engagementRate).toBeNull();
    expect(stats.note).toContain("no recent videos");
  });
});

describe("reading pasted accounts", () => {
  it("takes a handle, with or without the @", () => {
    const { refs } = resolveCreatorInput("@lucky_memes00\nnasa");
    expect(refs).toEqual([
      { platform: "INSTAGRAM", creatorId: "lucky_memes00" },
      { platform: "INSTAGRAM", creatorId: "nasa" },
    ]);
  });

  it("reads the handle out of a profile link without spending a lookup", () => {
    const { refs, contentUrls } = resolveCreatorInput(
      "https://www.instagram.com/nasa/\ninstagram.com/lucky_memes00/reel/Da49tXeqveU/",
    );
    expect(refs).toEqual([
      { platform: "INSTAGRAM", creatorId: "nasa" },
      { platform: "INSTAGRAM", creatorId: "lucky_memes00" },
    ]);
    expect(contentUrls).toEqual([]);
  });

  it("defers a reel link that does not name its owner", () => {
    const { refs, contentUrls } = resolveCreatorInput("https://www.instagram.com/reel/Da49tXeqveU/");
    expect(refs).toEqual([]);
    expect(contentUrls).toEqual(["https://www.instagram.com/reel/Da49tXeqveU/"]);
  });

  it("does not mistake Instagram's own pages for accounts", () => {
    const { refs, rejected } = resolveCreatorInput("https://www.instagram.com/explore/tags/reels/");
    expect(refs).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it("takes a YouTube handle or channel id, and defers a video", () => {
    const { refs, contentUrls } = resolveCreatorInput(
      "https://www.youtube.com/@MrBeast\n" +
        "https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA\n" +
        "https://youtu.be/dQw4w9WgXcQ",
    );
    expect(refs).toEqual([
      { platform: "YOUTUBE", creatorId: "@MrBeast" },
      { platform: "YOUTUBE", creatorId: "UCX6OQ3DkcsbYNE6H8uQQuVA" },
    ]);
    expect(contentUrls).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  });

  it("rejects Facebook, which has no account-level provider", () => {
    const { refs, contentUrls, rejected } = resolveCreatorInput(
      "https://www.facebook.com/reel/1234567890",
    );
    expect(refs).toEqual([]);
    expect(contentUrls).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it("counts the same account once however it was pasted", () => {
    const { refs } = resolveCreatorInput("@nasa\ninstagram.com/nasa\nnasa");
    expect(refs).toHaveLength(1);
  });
});

describe("csv export with creator stats", () => {
  const stats: CreatorStats = {
    platform: "INSTAGRAM",
    creatorId: "nasa",
    displayName: "NASA",
    profileUrl: "https://www.instagram.com/nasa/",
    followers: 1000,
    sampleSize: 2,
    avgViews: 150,
    avgLikes: 15,
    avgComments: 3,
    engagementRate: 1.8,
    engagementByViews: 12,
    status: "ok",
    note: null,
    provider: "test",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };

  it("leaves the export unchanged when no creator stats were fetched", () => {
    const csv = buildCsv([link({})]);
    expect(csv).not.toContain("Creator Followers");
  });

  it("appends creator columns when stats are present", () => {
    const csv = buildCsv([link({})], { [creatorKey("INSTAGRAM", "nasa")]: stats });
    const [header, row] = csv.replace(/^\uFEFF/, "").split("\r\n");

    expect(header).toContain("Creator Followers");
    expect(header).toContain("Creator Engagement Rate");
    expect(row.endsWith("1000,150,1.80%")).toBe(true);
  });

  it("writes N/A for a link whose creator was not looked up", () => {
    const csv = buildCsv([link({ creatorId: "esa" })], {
      [creatorKey("INSTAGRAM", "nasa")]: stats,
    });
    expect(csv.split("\r\n")[1].endsWith("N/A,N/A,N/A")).toBe(true);
  });
});
