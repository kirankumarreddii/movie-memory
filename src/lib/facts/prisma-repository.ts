import type { PrismaClient } from "@prisma/client";
import type { FactRepository } from "./types";

export function createPrismaFactRepository(prisma: PrismaClient): FactRepository {
  return {
    async getFavoriteMovie(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { favoriteMovie: true } });
      return user?.favoriteMovie ?? null;
    },

    findLatestFact(userId, movie) {
      return prisma.fact.findFirst({ where: { userId, movie }, orderBy: { createdAt: "desc" } });
    },

    createFact(input) {
      return prisma.fact.create({ data: input });
    },

    async tryAcquireLock(userId, token, now, expiresAt) {
      // Single atomic statement: insert the lease, or take over an expired one.
      // If a live lease exists the WHERE fails, nothing is returned, and we
      // lost the race. Postgres serializes concurrent upserts on the same key,
      // so exactly one caller can win.
      const rows = await prisma.$queryRaw<{ token: string }[]>`
        INSERT INTO "FactGenerationLock" ("userId", "token", "expiresAt")
        VALUES (${userId}, ${token}, ${expiresAt})
        ON CONFLICT ("userId") DO UPDATE
          SET "token" = EXCLUDED."token", "expiresAt" = EXCLUDED."expiresAt"
          WHERE "FactGenerationLock"."expiresAt" <= ${now}
        RETURNING "token"`;
      return rows.length === 1 && rows[0].token === token;
    },

    async releaseLock(userId, token) {
      // Token check: never delete a lease someone else took over after ours expired.
      await prisma.factGenerationLock.deleteMany({ where: { userId, token } });
    },

    async isLocked(userId, now) {
      const lock = await prisma.factGenerationLock.findFirst({ where: { userId, expiresAt: { gt: now } } });
      return lock !== null;
    },
  };
}
