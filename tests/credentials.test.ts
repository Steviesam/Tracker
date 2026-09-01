import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema, MIN_PASSWORD_LENGTH } from "@/lib/credentials";
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

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true);
  });

  it("resets once the window expires", async () => {
    const key = `reset-${Math.random()}`;
    expect(rateLimit(key, 1, 30).allowed).toBe(true);
    expect(rateLimit(key, 1, 30).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(rateLimit(key, 1, 30).allowed).toBe(true);
  });
});
