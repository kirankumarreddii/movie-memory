import type { FactRepository, StoredFact } from "./types";

/**
 * Test double with the same semantics as the Prisma repository, including the
 * lease: acquire succeeds only if no lock exists or the existing one expired.
 */
export function createInMemoryFactRepository(movies: Record<string, string | null> = {}) {
  const facts: StoredFact[] = [];
  const locks = new Map<string, { token: string; expiresAt: Date }>();
  let seq = 0;

  const repo: FactRepository = {
    async getFavoriteMovie(userId) {
      return movies[userId] ?? null;
    },
    async findLatestFact(userId, movie) {
      const matching = facts.filter((f) => f.userId === userId && f.movie === movie);
      return matching.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async createFact(input) {
      const fact = { id: `fact-${++seq}`, ...input };
      facts.push(fact);
      return fact;
    },
    async tryAcquireLock(userId, token, now, expiresAt) {
      const existing = locks.get(userId);
      if (existing && existing.expiresAt > now) return false;
      locks.set(userId, { token, expiresAt });
      return true;
    },
    async releaseLock(userId, token) {
      if (locks.get(userId)?.token === token) locks.delete(userId);
    },
    async isLocked(userId, now) {
      const lock = locks.get(userId);
      return Boolean(lock && lock.expiresAt > now);
    },
  };

  return { repo, facts, locks, movies };
}
