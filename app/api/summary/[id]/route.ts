import { route } from "@/lib/route";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { generateSummary, markGenerating } from "@/lib/generate";

export const maxDuration = 300;

/** Doctor-triggered (re)generation; runs synchronously so the doctor sees the result. */
async function handlePOST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (s.signoff) return NextResponse.json({ error: "Already signed off" }, { status: 400 });
  await markGenerating(id);
  const { session, error } = await generateSummary(id);
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json(session);
}

export const POST = route("summary/[id] POST", handlePOST);
