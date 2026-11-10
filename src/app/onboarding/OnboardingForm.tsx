"use client";

import { useActionState } from "react";
import { MOVIE_MAX_LENGTH } from "@/lib/movie-limits";
import { saveFavoriteMovie, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(saveFavoriteMovie, {});

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <label htmlFor="movie" className="text-sm font-medium text-neutral-700">
        What&apos;s your favorite movie?
      </label>
      {/* maxLength is a convenience only; the server action is the real check. */}
      <input
        id="movie"
        name="movie"
        required
        maxLength={MOVIE_MAX_LENGTH}
        autoFocus
        placeholder="e.g. Spirited Away"
        className="rounded-lg px-4 py-3 ring-1 ring-neutral-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "movie-error" : undefined}
      />
      {state.error && (
        <p id="movie-error" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
