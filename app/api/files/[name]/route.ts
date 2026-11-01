import { route } from "@/lib/route";
import { readFile } from "@/lib/store";

const TYPES: Record<string, string> = { wav: "audio/wav", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

async function handleGET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  const data = await readFile(name);
  if (!data) return new Response("Not found", { status: 404 });
  const ext = name.split(".").pop()!.toLowerCase();
  return new Response(new Uint8Array(data), {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "private, no-store" },
  });
}

export const GET = route("files/[name] GET", handleGET);
