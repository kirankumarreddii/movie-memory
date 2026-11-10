import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUserId: vi.fn() }));
vi.mock("@/lib/facts", () => ({ getFact: vi.fn() }));

import { getSessionUserId } from "@/lib/auth";
import { getFact } from "@/lib/facts";
import { GET } from "./route";

const fact = { id: "f1", movie: "Alien", content: "In space…", createdAt: "2026-01-01T00:00:00.000Z" };

describe("GET /api/fact", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 and never touches facts when unauthenticated", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getFact).not.toHaveBeenCalled();
  });

  it("only ever looks up facts for the session user", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue("alice");
    vi.mocked(getFact).mockResolvedValue({ ok: true, fact, source: "cache" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getFact).toHaveBeenCalledExactlyOnceWith("alice");
    expect(await res.json()).toEqual({ fact, source: "cache" });
  });

  it("maps service errors to status codes", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue("alice");
    vi.mocked(getFact).mockResolvedValue({ ok: false, code: "GENERATION_FAILED", message: "nope" });
    expect((await GET()).status).toBe(503);

    vi.mocked(getFact).mockResolvedValue({ ok: false, code: "NO_MOVIE", message: "set one" });
    expect((await GET()).status).toBe(409);
  });
});
