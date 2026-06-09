"use client";
import dynamic from "next/dynamic";

// ssr:false keeps Tone.js / AudioContext off the server (must live in a client component).
const ShareStudio = dynamic(
  () => import("@/components/ShareStudio").then((m) => m.ShareStudio),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen grid place-items-center text-[#8a8aa0]">Loading scape…</div>
    ),
  },
);

export function ShareClient({ slug }: { slug: string }) {
  return <ShareStudio slug={slug} />;
}
