import { describe, expect, it } from "vitest";
import { cellsFromPastedText, detectLinks, extractUrls, parseSocialUrl } from "@/lib/detect";

describe("extractUrls", () => {
  it("finds multiple urls inside one cell", () => {
    const urls = extractUrls(
      "see https://www.instagram.com/reel/ABC123/ and https://youtu.be/dQw4w9WgXcQ",
    );
    expect(urls).toHaveLength(2);
  });

  it("finds urls without a scheme", () => {
    expect(extractUrls("instagram.com/reel/ABC123/")).toEqual(["instagram.com/reel/ABC123/"]);
  });

  it("strips trailing punctuation", () => {
    expect(extractUrls("(https://youtu.be/dQw4w9WgXcQ).")).toEqual(["https://youtu.be/dQw4w9WgXcQ"]);
  });

  it("ignores plain text", () => {
    expect(extractUrls("Creator A posted on time")).toEqual([]);
  });
});

describe("parseSocialUrl", () => {
  it("parses instagram reels and posts", () => {
    expect(parseSocialUrl("https://www.instagram.com/reel/DKx91abcDEF/")).toMatchObject({
      platform: "INSTAGRAM",
      externalId: "DKx91abcDEF",
      contentType: "REEL",
    });
    expect(parseSocialUrl("https://instagram.com/p/ABC123xyz99/")).toMatchObject({
      contentType: "POST",
    });
  });

  it("keeps the instagram handle when the url carries one", () => {
    expect(parseSocialUrl("https://www.instagram.com/nasa/reel/DKx91abcDEF/")).toMatchObject({
      creatorHint: "nasa",
    });
    // The bare form has no handle, which Business Discovery needs.
    expect(parseSocialUrl("https://www.instagram.com/reel/DKx91abcDEF/")?.creatorHint).toBeNull();
  });

  it("normalises every youtube form to one canonical url", () => {
    const canonical = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(parseSocialUrl(url)?.canonicalUrl).toBe(canonical);
    }
  });

  it("parses facebook reels and watch links", () => {
    expect(parseSocialUrl("https://www.facebook.com/reel/123456789012345")).toMatchObject({
      platform: "FACEBOOK",
      contentType: "REEL",
    });
    expect(parseSocialUrl("https://www.facebook.com/watch/?v=987654321098765")).toMatchObject({
      externalId: "987654321098765",
    });
  });

  it("flags facebook short links as needing resolution", () => {
    expect(parseSocialUrl("https://fb.watch/abc123/")?.needsResolution).toBe(true);
  });

  it("rejects profile pages, tiktok and unsupported platforms", () => {
    expect(parseSocialUrl("https://www.instagram.com/creator_f/")).toBeNull();
    expect(parseSocialUrl("https://www.youtube.com/@somechannel")).toBeNull();
    expect(parseSocialUrl("https://www.tiktok.com/@a/video/7234567890123456789")).toBeNull();
    expect(parseSocialUrl("https://twitter.com/x/status/1234567890")).toBeNull();
    expect(parseSocialUrl("not a url")).toBeNull();
  });
});

describe("detectLinks", () => {
  const cell = (text: string, creatorHint: string | null = null) =>
    ({ sheet: "Sheet1", row: 1, text, creatorHint, source: "file" }) as const;

  it("removes duplicates across different url forms", () => {
    const outcome = detectLinks([
      cell("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      cell("https://youtu.be/dQw4w9WgXcQ"),
      cell("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ]);
    expect(outcome.links).toHaveLength(1);
    expect(outcome.duplicatesRemoved).toBe(2);
    expect(outcome.totalUrlsFound).toBe(3);
  });

  it("counts unsupported urls separately instead of failing", () => {
    const outcome = detectLinks([cell("https://twitter.com/a/status/1"), cell("https://example.com")]);
    expect(outcome.links).toHaveLength(0);
    expect(outcome.unsupportedSkipped).toBe(2);
  });

  it("falls back to the creator column when the url has no handle", () => {
    const outcome = detectLinks([cell("https://youtu.be/dQw4w9WgXcQ", "Creator A")]);
    expect(outcome.links[0].creatorHint).toBe("Creator A");
  });

  it("prefers the handle embedded in the url", () => {
    const outcome = detectLinks([
      cell("https://www.instagram.com/real_handle/reel/ABC123/", "Spreadsheet Name"),
    ]);
    expect(outcome.links[0].creatorHint).toBe("real_handle");
  });
});

describe("pasted url input", () => {
  it("accepts one url per line, comma separated, or a mix", () => {
    const outcome = detectLinks(
      cellsFromPastedText(
        [
          "https://www.instagram.com/reel/ABC123/",
          "https://youtu.be/dQw4w9WgXcQ, https://www.facebook.com/reel/123456789012345",
          "  ",
        ].join("\n"),
      ),
    );
    expect(outcome.links).toHaveLength(3);
    expect(outcome.links.map((link) => link.platform).sort()).toEqual([
      "FACEBOOK",
      "INSTAGRAM",
      "YOUTUBE",
    ]);
    expect(outcome.links.every((link) => link.source === "paste")).toBe(true);
  });

  it("still deduplicates across pasted lines", () => {
    const outcome = detectLinks(
      cellsFromPastedText("https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    );
    expect(outcome.links).toHaveLength(1);
    expect(outcome.duplicatesRemoved).toBe(1);
  });

  it("handles a single url with no separators", () => {
    expect(detectLinks(cellsFromPastedText("https://youtu.be/dQw4w9WgXcQ")).links).toHaveLength(1);
  });
});
