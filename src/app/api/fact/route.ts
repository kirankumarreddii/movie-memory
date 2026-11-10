import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getFact } from "@/lib/facts";

// Never statically cache: the answer depends on the session and on time.
export const dynamic = "force-dynamic";

/**
 * GET /api/fact — a fact about the *caller's* favorite movie.
 *
 * There is intentionally no userId parameter: the user is always taken from
 * the session, so one user cannot request another user's facts.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Please sign in." } }, { status: 401 });
  }

  const result = await getFact(userId);
  if (result.ok) {
    return NextResponse.json({ fact: result.fact, source: result.source });
  }

  const status = result.code === "NO_MOVIE" ? 409 : 503;
  const headers = result.code === "BUSY" ? { "Retry-After": "5" } : undefined;
  return NextResponse.json({ error: { code: result.code, message: result.message } }, { status, headers });
}
