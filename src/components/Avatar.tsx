import Image from "next/image";

export function Avatar({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name ?? "Profile photo"}
        width={64}
        height={64}
        className="h-16 w-16 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  // No Google photo: fall back to an initial (or a neutral glyph with no name either).
  const initial = name?.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden
      className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-semibold text-indigo-700"
    >
      {initial}
    </div>
  );
}
