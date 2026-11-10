import { z } from "zod";

import { MOVIE_MAX_LENGTH } from "./movie-limits";

export { MOVIE_MAX_LENGTH };

// Trim and collapse internal whitespace before checking length, so "   " is
// rejected and "The   Matrix" is stored as "The Matrix". Min is 1 because
// real titles can be one character long (e.g. "M", 1931).
export const movieTitleSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Please enter a movie title.")
      .max(MOVIE_MAX_LENGTH, `Movie title must be at most ${MOVIE_MAX_LENGTH} characters.`),
  );

export type MovieValidation = { ok: true; title: string } | { ok: false; error: string };

export function validateMovieTitle(input: unknown): MovieValidation {
  if (typeof input !== "string") return { ok: false, error: "Please enter a movie title." };
  const result = movieTitleSchema.safeParse(input);
  if (!result.success) return { ok: false, error: result.error.issues[0].message };
  return { ok: true, title: result.data };
}
