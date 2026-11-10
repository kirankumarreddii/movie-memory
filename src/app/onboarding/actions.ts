"use server";

import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { validateMovieTitle } from "@/lib/movie";
import { prisma } from "@/lib/prisma";

export type OnboardingState = { error?: string };

export async function saveFavoriteMovie(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  // Server actions are public POST endpoints: re-check auth and re-validate here.
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const result = validateMovieTitle(formData.get("movie"));
  if (!result.ok) return { error: result.error };

  // Scoped to the session user, and only while the movie is still unset, so
  // onboarding really is first-time only even if the action is replayed.
  await prisma.user.updateMany({
    where: { id: userId, favoriteMovie: null },
    data: { favoriteMovie: result.title },
  });

  redirect("/dashboard");
}
