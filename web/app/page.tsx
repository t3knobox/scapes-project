"use client";
import dynamic from "next/dynamic";

// ssr:false keeps all Tone.js / AudioContext code off the server entirely.
// Per Next 16 docs, ssr:false requires a Client Component — hence "use client" above.
const Studio = dynamic(() => import("@/components/Studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen grid place-items-center text-[#8a8aa0]">Loading studio…</div>
  ),
});

export default function Home() {
  return <Studio />;
}
