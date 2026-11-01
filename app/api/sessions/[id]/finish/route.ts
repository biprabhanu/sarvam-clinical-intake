import { after, NextResponse } from "next/server";
import { route } from "@/lib/route";
import { getSession } from "@/lib/store";
import { generateSummary, markGenerating } from "@/lib/generate";

export const maxDuration = 300; // after() runs within the route's max duration

/** Patient taps Finish: mark the session as generating and build the summary after responding. */
async function handlePOST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (s.status !== "in_progress") return NextResponse.json({ error: "Interview already finished" }, { status: 400 });
  const session = await markGenerating(id);
  after(async () => {
    try {
      await generateSummary(id);
    } catch (e) {
      console.error(`[finish ${id}] summary generation crashed`, e);
    }
  });
  return NextResponse.json(session);
}

export const POST = route("sessions/[id]/finish POST", handlePOST);
