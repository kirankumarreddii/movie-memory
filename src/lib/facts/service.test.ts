import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryFactRepository } from "./in-memory-repository";
import { CACHE_WINDOW_MS, getFactForUser, LOCK_TTL_MS, type FactServiceDeps } from "./service";
import type { FactGenerator } from "./types";

const T0 = new Date("2026-01-01T12:00:00.000Z");

function setup(movies: Record<string, string | null> = { alice: "Alien", bob: "Babe" }) {
  let clock = T0.getTime();
  const store = createInMemoryFactRepository(movies);
  let n = 0;
  const generate = vi.fn<FactGenerator["generate"]>(async (movie) => `fact #${++n} about ${movie}`);
  const deps: FactServiceDeps = {
    repo: store.repo,
    generator: { generate },
    now: () => new Date(clock),
    // Advancing the fake clock on sleep lets wait loops terminate instantly.
    sleep: async (ms) => {
      clock += ms;
    },
  };
  return {
    ...store,
    deps,
    generate,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("60-second cache window", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("generates and stores a fact when none exists", async () => {
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "generated", fact: { content: "fact #1 about Alien" } });
    expect(t.facts).toHaveLength(1);
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

  it("returns the cached fact when the latest is younger than 60s", async () => {
    await getFactForUser("alice", t.deps);
    t.advance(CACHE_WINDOW_MS - 1);
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "cache", fact: { content: "fact #1 about Alien" } });
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

  it("generates a new fact once the latest is exactly 60s old", async () => {
    await getFactForUser("alice", t.deps);
    t.advance(CACHE_WINDOW_MS);
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "generated", fact: { content: "fact #2 about Alien" } });
    expect(t.facts).toHaveLength(2);
  });

  it("keys the cache on movie: a fresh fact for a different movie is not reused", async () => {
    await getFactForUser("alice", t.deps);
    t.movies.alice = "Aliens";
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "generated", fact: { movie: "Aliens" } });
  });

  it("returns NO_MOVIE when the user has not onboarded", async () => {
    const t2 = setup({ carol: null });
    const res = await getFactForUser("carol", t2.deps);
    expect(res).toMatchObject({ ok: false, code: "NO_MOVIE" });
    expect(t2.generate).not.toHaveBeenCalled();
  });
});

describe("authorization / user isolation", () => {
  it("never returns another user's fact, even a fresh one", async () => {
    const t = setup();
    await getFactForUser("bob", t.deps);
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "generated", fact: { movie: "Alien" } });
    expect(res.ok && res.fact.content).not.toContain("Babe");
  });

  it("does not expose userId in the returned fact", async () => {
    const t = setup();
    const res = await getFactForUser("alice", t.deps);
    expect(res.ok && Object.keys(res.fact).sort()).toEqual(["content", "createdAt", "id", "movie"]);
  });

  it("one user's in-flight generation does not block another user", async () => {
    const t = setup();
    await t.repo.tryAcquireLock("bob", "someone", T0, new Date(T0.getTime() + LOCK_TTL_MS));
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "generated" });
  });
});

describe("burst protection", () => {
  it("concurrent requests generate exactly one fact and all receive it", async () => {
    const t = setup();
    let release!: () => void;
    t.generate.mockImplementationOnce(
      (movie) => new Promise((resolve) => (release = () => resolve(`slow fact about ${movie}`))),
    );
    // Real-time sleep for this test so the waiters actually yield to the generator.
    const deps = { ...t.deps, sleep: () => new Promise<void>((r) => setTimeout(r, 1)) };

    const pending = Promise.all([1, 2, 3, 4, 5].map(() => getFactForUser("alice", deps)));
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    const results = await pending;

    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.facts).toHaveLength(1);
    for (const r of results) expect(r).toMatchObject({ ok: true, fact: { content: "slow fact about Alien" } });
    expect(t.locks.size).toBe(0);
  });

  it("takes over a lease left behind by a crashed holder once it expires", async () => {
    const t = setup();
    await t.repo.tryAcquireLock("alice", "crashed", T0, new Date(T0.getTime() + LOCK_TTL_MS));
    t.advance(LOCK_TTL_MS);
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "generated" });
  });

  it("a waiter gives up with BUSY (no cached fact) if the holder never finishes", async () => {
    const t = setup();
    await t.repo.tryAcquireLock("alice", "stuck", T0, new Date(T0.getTime() + LOCK_TTL_MS));
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: false, code: "BUSY" });
    expect(t.generate).not.toHaveBeenCalled();
  });
});

describe("failure handling", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("falls back to the most recent fact when OpenAI fails", async () => {
    const t = setup();
    await getFactForUser("alice", t.deps);
    t.advance(CACHE_WINDOW_MS + 1);
    t.generate.mockRejectedValueOnce(new Error("timeout"));
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: true, source: "stale-fallback", fact: { content: "fact #1 about Alien" } });
    expect(t.locks.size).toBe(0);
  });

  it("returns a friendly error when OpenAI fails and there is no fact yet", async () => {
    const t = setup();
    t.generate.mockRejectedValueOnce(new Error("500"));
    const res = await getFactForUser("alice", t.deps);
    expect(res).toMatchObject({ ok: false, code: "GENERATION_FAILED" });
    expect(t.locks.size).toBe(0);
  });
});
