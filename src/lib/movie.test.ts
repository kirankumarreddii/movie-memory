import { describe, expect, it } from "vitest";
import { MOVIE_MAX_LENGTH, validateMovieTitle } from "./movie";

describe("validateMovieTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(validateMovieTitle("  The   Matrix ")).toEqual({ ok: true, title: "The Matrix" });
  });
  it("rejects empty / whitespace-only / non-string input", () => {
    expect(validateMovieTitle("   ").ok).toBe(false);
    expect(validateMovieTitle(null).ok).toBe(false);
  });
  it("enforces the max length after trimming", () => {
    expect(validateMovieTitle(" " + "a".repeat(MOVIE_MAX_LENGTH) + " ").ok).toBe(true);
    expect(validateMovieTitle("a".repeat(MOVIE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});
