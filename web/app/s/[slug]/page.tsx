import type { Metadata } from "next";
import { ShareClient } from "./ShareClient";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function getScape(slug: string) {
  try {
    const res = await fetch(`${API}/s/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Server-rendered <head> so share links unfurl with the scape's prompt + background image.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await getScape(slug);
  if (!s) return { title: "Scape not found · The Scapes Project" };

  const quote = s.prompt ? `“${s.prompt}”` : "An ambient soundscape";
  const images = s.bgUrl ? [s.bgUrl] : [];
  return {
    title: `${quote} · The Scapes Project`,
    description: "An ambient soundscape on The Scapes Project — press play, let it breathe.",
    openGraph: {
      title: quote,
      description: "A soundscape on The Scapes Project. Tap to play it.",
      images,
      type: "website",
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: quote,
      description: "A soundscape on The Scapes Project.",
      images,
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ShareClient slug={slug} />;
}
