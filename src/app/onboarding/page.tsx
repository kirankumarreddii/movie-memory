import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.favoriteMovie) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold tracking-tight">Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}!</h1>
      <OnboardingForm />
    </main>
  );
}
