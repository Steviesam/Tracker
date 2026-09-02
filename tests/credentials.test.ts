import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema, MIN_PASSWORD_LENGTH } from "@/lib/credentials";
import { databaseReachable } from "./helpers/database";
import { rateLimit } from "@/lib/rate-limit";

describe("signupSchema", () => {
  const valid = { name: "Chandan Singh", email: "Chandan@Example.COM ", password: "a".repeat(16) };

  it("normalises email to lowercase and trims it", () => {
    expect(signupSchema.parse(valid).email).toBe("chandan@example.com");
  });

  it("trims the name", () => {
    expect(signupSchema.parse({ ...valid, name: "  Ada  " }).name).toBe("Ada");
  });

  it("rejects short passwords", () => {
    const result = signupSchema.safeParse({ ...valid, password: "a".repeat(MIN_PASSWORD_LENGTH - 1) });
    expect(result.success).toBe(false);
  });

  it("accepts a password at exactly the minimum length", () => {
    expect(signupSchema.safeParse({ ...valid, password: "a".repeat(MIN_PASSWORD_LENGTH) }).success).toBe(true);
  });

  it("rejects malformed emails and empty names", () => {
    expect(signupSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normalises email but does not impose a length rule on the password", () => {
    const parsed = loginSchema.parse({ email: " USER@Example.com ", password: "x" });
    expect(parsed.email).toBe("user@example.com");
  });
});

// The limiter counts in Postgres, so these need a database. Skipped rather than failed
// when there is none, so `npm test` still runs for someone who has not started Docker.
describe.runIf(await databaseReachable())("rateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      expect((await rateLimit(key, 3, 60_000)).allowed).toBe(true);
    }
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks keys independently", async () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    await rateLimit(a, 1, 60_000);
    expect((await rateLimit(a, 1, 60_000)).allowed).toBe(false);
    expect((await rateLimit(b, 1, 60_000)).allowed).toBe(true);
  });

  it("resets once the window expires", async () => {
    const key = `reset-${Math.random()}`;
    expect((await rateLimit(key, 1, 30)).allowed).toBe(true);
    expect((await rateLimit(key, 1, 30)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await rateLimit(key, 1, 30)).allowed).toBe(true);
  });

  it("counts a shared key across callers, which is the point of storing it", async () => {
    const key = `shared-${Math.random()}`;
    const results = await Promise.all([
      rateLimit(key, 2, 60_000),
      rateLimit(key, 2, 60_000),
      rateLimit(key, 2, 60_000),
    ]);
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
  });
});
