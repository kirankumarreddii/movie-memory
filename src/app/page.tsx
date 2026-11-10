import { redirect } from "next/navigation";
import { SignInButton } from "@/components/SignInButton";
import { getCurrentUser } from "@/lib/auth";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.favoriteMovie ? "/dashboard" : "/onboarding");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Movie Memory</h1>
      <p className="max-w-md text-neutral-600">Tell us your favorite movie and we&apos;ll keep you supplied with fun facts about it.</p>
      <SignInButton />
    </main>
  );
}
