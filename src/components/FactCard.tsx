"use client";

import { useCallback, useEffect, useState } from "react";
import type { FactDTO, FactSource } from "@/lib/facts/types";

type State =
  | { status: "loading" }
  | { status: "ready"; fact: FactDTO; source: FactSource }
  | { status: "error"; message: string };

export function FactCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/fact", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!res.ok || !body?.fact) {
        setState({ status: "error", message: body?.error?.message ?? "Something went wrong." });
        return;
      }
      setState({ status: "ready", fact: body.fact, source: body.source });
    } catch {
      setState({ status: "error", message: "Network error. Check your connection and try again." });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Fun fact</h2>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="rounded-md px-3 py-1 text-sm text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {refreshing ? "Loading…" : "Get another"}
        </button>
      </div>

      {state.status === "loading" && <p className="animate-pulse text-neutral-400">Thinking of something fun…</p>}

      {state.status === "error" && <p className="text-red-600">{state.message}</p>}

      {state.status === "ready" && (
        <>
          <p className="text-lg leading-relaxed text-neutral-800">{state.fact.content}</p>
          <p className="mt-3 text-xs text-neutral-400">
            {state.source === "stale-fallback"
              ? "Couldn't fetch a new fact right now, so here's your most recent one."
              : state.source === "cache"
                ? "New facts are generated at most once a minute."
                : "Freshly generated."}
          </p>
        </>
      )}
    </section>
  );
}
