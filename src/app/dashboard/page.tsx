import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FactCard } from "@/components/FactCard";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.favoriteMovie) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={user.name} image={user.image} />
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{user.name ?? "Movie fan"}</p>
            {user.email && <p className="truncate text-sm text-neutral-500">{user.email}</p>}
          </div>
        </div>
        <SignOutButton />
      </header>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Favorite movie</h2>
        <p className="mt-1 text-2xl font-bold">{user.favoriteMovie}</p>
      </section>

      <FactCard />
    </main>
  );
}
