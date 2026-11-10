import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaFactRepository } from "./prisma-repository";
import { getFactForUser } from "./service";

// Runs against a real Postgres (npm run test:db). Skipped by `npm test`, which
// does not set RUN_DB_TESTS, so the unit suite stays fast and dependency-free.
describe.skipIf(!process.env.RUN_DB_TESTS)("Prisma repository (real Postgres)", () => {
  const prisma = new PrismaClient();
  const repo = createPrismaFactRepository(prisma);
  let userId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { email: `${crypto.randomUUID()}@test.local`, favoriteMovie: "Heat" } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
    await prisma.$disconnect();
  });

  it("exactly one of many concurrent callers acquires the lease", async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 30_000);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => repo.tryAcquireLock(userId, `t${i}`, now, later)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("only the holder can release, and an expired lease can be taken over", async () => {
    const now = new Date();
    expect(await repo.tryAcquireLock(userId, "a", now, new Date(now.getTime() + 1000))).toBe(true);
    await repo.releaseLock(userId, "b");
    expect(await repo.isLocked(userId, now)).toBe(true);

    const afterExpiry = new Date(now.getTime() + 1000);
    expect(await repo.tryAcquireLock(userId, "b", afterExpiry, new Date(afterExpiry.getTime() + 1000))).toBe(true);
    await repo.releaseLock(userId, "a"); // stale holder must not free b's lease
    expect(await repo.isLocked(userId, afterExpiry)).toBe(true);
  });

  it("concurrent fact requests produce exactly one stored fact", async () => {
    const generate = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return "Shot on real LA streets.";
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => getFactForUser(userId, { repo, generator: { generate } })),
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await prisma.fact.count({ where: { userId } })).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
