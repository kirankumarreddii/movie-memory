import { randomUUID } from "node:crypto";
import type { FactGenerator, FactRepository, FactResult, StoredFact } from "./types";

export const CACHE_WINDOW_MS = 60_000;
// Must exceed the OpenAI timeout so a live holder never loses its lease.
export const LOCK_TTL_MS = 30_000;
// How long a request that lost the race waits for the winner's fact.
export const WAIT_FOR_PEER_MS = 15_000;
export const POLL_INTERVAL_MS = 250;

export interface FactServiceDeps {
  repo: FactRepository;
  generator: FactGenerator;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isFresh(fact: StoredFact, now: Date): boolean {
  return now.getTime() - fact.createdAt.getTime() < CACHE_WINDOW_MS;
}

function ok(fact: StoredFact, source: "cache" | "generated" | "stale-fallback"): FactResult {
  return {
    ok: true,
    source,
    fact: { id: fact.id, movie: fact.movie, content: fact.content, createdAt: fact.createdAt.toISOString() },
  };
}

/**
 * Returns a fact about the user's favorite movie.
 *
 * 1. A fact for (user, movie) younger than 60s is returned as-is.
 * 2. Otherwise one request per user wins a DB lease and calls OpenAI; any
 *    concurrent request (refresh spam, other tabs, other instances) waits for
 *    the winner's fact instead of generating its own.
 * 3. If generation fails, the most recent fact is returned as a fallback;
 *    with no fact at all, a user-friendly error.
 */
export async function getFactForUser(userId: string, deps: FactServiceDeps): Promise<FactResult> {
  const { repo, generator } = deps;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;

  const movie = await repo.getFavoriteMovie(userId);
  if (!movie) {
    return { ok: false, code: "NO_MOVIE", message: "Set your favorite movie first." };
  }

  const latest = await repo.findLatestFact(userId, movie);
  if (latest && isFresh(latest, now())) return ok(latest, "cache");

  const token = randomUUID();
  const acquiredAt = now();
  const acquired = await repo.tryAcquireLock(
    userId,
    token,
    acquiredAt,
    new Date(acquiredAt.getTime() + LOCK_TTL_MS),
  );

  if (!acquired) return waitForPeer(userId, movie, latest, deps.repo, now, sleep);

  try {
    // Double-check: another request may have finished generating between our
    // cache read and taking the lease.
    const recheck = await repo.findLatestFact(userId, movie);
    if (recheck && isFresh(recheck, now())) return ok(recheck, "cache");

    let content: string;
    try {
      content = await generator.generate(movie);
    } catch (err) {
      console.error("[facts] generation failed", { userId, err: err instanceof Error ? err.message : err });
      return fallback(recheck ?? latest);
    }

    const fact = await repo.createFact({ userId, movie, content, createdAt: now() });
    return ok(fact, "generated");
  } finally {
    await repo.releaseLock(userId, token);
  }
}

async function waitForPeer(
  userId: string,
  movie: string,
  latest: StoredFact | null,
  repo: FactRepository,
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
): Promise<FactResult> {
  const deadline = now().getTime() + WAIT_FOR_PEER_MS;
  while (now().getTime() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const current = await repo.findLatestFact(userId, movie);
    if (current && isFresh(current, now())) return ok(current, "cache");
    // The holder finished without producing a fresh fact (it failed): stop waiting.
    if (!(await repo.isLocked(userId, now()))) return fallback(current ?? latest);
  }
  return latest
    ? ok(latest, "stale-fallback")
    : { ok: false, code: "BUSY", message: "A fact is still being generated. Please try again in a moment." };
}

function fallback(latest: StoredFact | null): FactResult {
  if (latest) return ok(latest, "stale-fallback");
  return {
    ok: false,
    code: "GENERATION_FAILED",
    message: "We couldn't come up with a fact right now. Please try again shortly.",
  };
}
