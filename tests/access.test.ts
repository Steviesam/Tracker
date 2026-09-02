import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLOSED, decideSignup, isOwner, MEMBER, OWNER } from "@/lib/access";
import { prisma } from "@/lib/db";
import { databaseReachable } from "./helpers/database";

/**
 * The signup gate is the only thing standing between a public URL and a stranger spending
 * the deployment's provider credits, so it is tested against a real database rather than a
 * mock: what matters is the behaviour of the queries, not that they were called.
 */
describe.runIf(await databaseReachable())("decideSignup", () => {
  // Every test starts from an empty deployment, which is also the interesting first case.
  async function reset() {
    await prisma.invite.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeEach(reset);
  afterEach(reset);

  async function makeUser(email: string, role: string) {
    return prisma.user.create({
      data: { email, name: email, passwordHash: "x", role },
      select: { id: true },
    });
  }

  it("lets the first account claim the deployment as owner", async () => {
    const decision = await decideSignup("first@example.com");
    expect(decision).toEqual({ allowed: true, role: OWNER });
  });

  it("turns away an uninvited email once an account exists", async () => {
    await makeUser("owner@example.com", OWNER);

    const decision = await decideSignup("stranger@example.com");
    expect(decision).toEqual({ allowed: false, reason: CLOSED });
  });

  it("lets an invited email sign up as a member", async () => {
    await makeUser("owner@example.com", OWNER);
    await prisma.invite.create({ data: { email: "guest@example.com" } });

    expect(await decideSignup("guest@example.com")).toEqual({ allowed: true, role: MEMBER });
  });

  it("does not let one invite create two accounts", async () => {
    await makeUser("owner@example.com", OWNER);
    await prisma.invite.create({ data: { email: "guest@example.com", acceptedAt: new Date() } });

    const decision = await decideSignup("guest@example.com");
    expect(decision.allowed).toBe(false);
  });

  it("stops matching once the invite is withdrawn", async () => {
    await makeUser("owner@example.com", OWNER);
    await prisma.invite.create({ data: { email: "guest@example.com" } });
    await prisma.invite.deleteMany({ where: { email: "guest@example.com" } });

    expect(await decideSignup("guest@example.com")).toEqual({ allowed: false, reason: CLOSED });
  });

  it("reads the role from the database, so a revoked owner is no longer one", async () => {
    const user = await makeUser("owner@example.com", OWNER);
    expect(await isOwner(user.id)).toBe(true);

    await prisma.user.update({ where: { id: user.id }, data: { role: MEMBER } });
    expect(await isOwner(user.id)).toBe(false);
  });

  it("treats a deleted account as not the owner rather than throwing", async () => {
    const user = await makeUser("owner@example.com", OWNER);
    await prisma.user.delete({ where: { id: user.id } });

    expect(await isOwner(user.id)).toBe(false);
  });
});
