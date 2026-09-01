import { describe, expect, it } from "vitest";
import { buildCsv } from "@/lib/export";
import { formatMetric } from "@/lib/format";
import { normaliseItem } from "@/lib/providers/public-data";
import { toCount, toIsoDate, toNumber } from "@/lib/providers/types";
import { EMPTY_METRICS, type LinkResult } from "@/lib/types";

describe("toNumber", () => {
  it("keeps a genuine zero and rejects missing values", () => {
    expect(toNumber(0)).toBe(0);
    expect(toNumber("1234")).toBe(1234);
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("not a number")).toBeNull();
  });
});

describe("toCount", () => {
  it("reads Instagram's -1 for a hidden count as unknown, not as a number", () => {
    expect(toCount(-1)).toBeNull();
    expect(toCount("-1")).toBeNull();
    expect(toCount(0)).toBe(0);
    expect(toCount(41588)).toBe(41588);
  });
});

describe("toIsoDate", () => {
  it("accepts iso strings, unix seconds and unix milliseconds", () => {
    expect(toIsoDate("2026-01-02T03:04:05Z")).toBe("2026-01-02T03:04:05.000Z");
    expect(toIsoDate(1767322800)).toBe(new Date(1767322800000).toISOString());
    expect(toIsoDate(1767322800000)).toBe(new Date(1767322800000).toISOString());
  });

  it("returns null rather than an invalid date", () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate("nonsense")).toBeNull();
  });
});

describe("public data provider normalisation", () => {
  it("maps common actor field spellings onto our metric shape", () => {
    const item = normaliseItem({
      url: "https://www.instagram.com/reel/ABC123/",
      ownerUsername: "creator_a",
      caption: "hello",
      timestamp: "2026-02-03T10:00:00Z",
      videoPlayCount: 5000,
      likesCount: 250,
      commentsCount: 12,
    });

    expect(item).toMatchObject({
      creator: "creator_a",
      views: 5000,
      likes: 250,
      comments: 12,
      postedAt: "2026-02-03T10:00:00.000Z",
    });
    // Not returned by the actor, so it stays unknown rather than becoming 0.
    expect(item.shares).toBeNull();
  });

  it("does not treat a hidden like count as zero likes", () => {
    const item = normaliseItem({
      url: "https://www.instagram.com/reel/ABC123/",
      likesCount: -1,
      commentsCount: 8,
    });
    expect(item.likes).toBeNull();
    expect(item.comments).toBe(8);
  });

  it("reads the counts an actor nests under metrics", () => {
    const item = normaliseItem({
      code: "Da49tXeqveU",
      metrics: { play_count: 2920440, like_count: 41588, comment_count: 338 },
    });
    expect(item.url).toBe("https://www.instagram.com/p/Da49tXeqveU/");
    expect(item).toMatchObject({ views: 2920440, likes: 41588, comments: 338 });
  });

  it("keeps the URL of a row the actor could not read, so the failure can be reported", () => {
    const item = normaliseItem({
      postCode: "https://www.instagram.com/reel/DbxYfjTtrQK/",
      error: "failed_to_fetch_post_details",
      success: false,
    });
    expect(item.url).toBe("https://www.instagram.com/reel/DbxYfjTtrQK/");
  });

  it("leaves everything null when the actor returns an unrelated shape", () => {
    const item = normaliseItem({ somethingElse: true });
    expect(item.views).toBeNull();
    expect(item.likes).toBeNull();
    expect(item.creator).toBeNull();
  });
});

describe("formatting", () => {
  it("renders missing metrics as N/A and zero as 0", () => {
    expect(formatMetric(null)).toBe("N/A");
    expect(formatMetric(0)).toBe("0");
    expect(formatMetric(1234567)).toBe("1,234,567");
  });
});

describe("csv export", () => {
  const result: LinkResult = {
    id: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    platform: "YOUTUBE",
    originalUrl: "https://youtu.be/dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    externalId: "dQw4w9WgXcQ",
    contentType: "VIDEO",
    creatorHint: null,
    source: "file",
    sheet: "Sheet1",
    row: 2,
    creator: 'Creator "Quoted", Inc',
    creatorId: "UC_test_channel",
    title: "Title",
    postedAt: "2025-11-30T09:00:00.000Z",
    metrics: { ...EMPTY_METRICS, views: 100, likes: 10 },
    status: "partial",
    note: "Shares are not available.",
    provider: "youtube-data-api-v3",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };

  it("writes N/A for unavailable metrics and escapes quotes", () => {
    const csv = buildCsv([result]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain('"Creator ""Quoted"", Inc"');
    expect(dataLine).toContain("N/A");
    expect(dataLine.split(",")).toContain("100");
  });

  it("exports the post date as a plain day", () => {
    expect(buildCsv([result]).split("\r\n")[1]).toContain("2025-11-30");
  });
});
