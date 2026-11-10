"use client";

import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      type="button"
      // Send everyone to /dashboard; it bounces first-time users to onboarding.
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className="rounded-lg bg-white px-5 py-3 font-medium text-neutral-900 shadow ring-1 ring-neutral-200 transition hover:bg-neutral-50"
    >
      Sign in with Google
    </button>
  );
}
