"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// ssr:false keeps Tone.js / AudioContext off the server (mirrors app/page.tsx).
const ShareStudio = dynamic(
  () => import("@/components/ShareStudio").then((m) => m.ShareStudio),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen grid place-items-center text-[#8a8aa0]">Loading scape…</div>
    ),
  },
);

export default function SharePage() {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : (params.slug ?? "");
  return <ShareStudio slug={slug} />;
}
