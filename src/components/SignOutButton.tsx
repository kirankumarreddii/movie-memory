"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-lg px-3 py-2 text-sm text-neutral-600 ring-1 ring-neutral-300 transition hover:bg-neutral-100"
    >
      Log out
    </button>
  );
}
