import { route } from "@/lib/route";
import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/store";
import { chat, SarvamError } from "@/lib/sarvam";
import { buildUserPrompt, extractJson, SYSTEM_PROMPT, validateSummary } from "@/lib/summary";
import type { Summary } from "@/lib/types";

export const maxDuration = 300;

async function handlePOST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (s.signoff) return NextResponse.json({ error: "Already signed off" }, { status: 400 });
  if (s.answers.length === 0) {
    await updateSession(id, (x) => { x.status = "ready"; x.summaryError = "No answers were recorded."; });
    return NextResponse.json({ error: "No answers were recorded" }, { status: 400 });
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(s) },
  ];
  let summary: Summary | null = null;
  let lastError = "";
  for (let attempt = 1; attempt <= 2 && !summary; attempt++) {
    try {
      const { content, model } = await chat(messages);
      summary = validateSummary(extractJson(content), s, model);
    } catch (e) {
      lastError = e instanceof SarvamError ? e.message : `Invalid model output: ${(e as Error).message}`;
      console.warn(`[summary] attempt ${attempt} failed:`, lastError);
      if (e instanceof SarvamError && e.status === 403) break; // bad key — retrying won't help
    }
  }

  const updated = await updateSession(id, (x) => {
    x.status = "ready";
    if (summary) { x.summary = summary; x.summaryError = null; }
    else x.summaryError = `Summary generation failed — ${lastError}`;
  });
  if (!summary) return NextResponse.json({ error: updated?.summaryError }, { status: 502 });
  return NextResponse.json(updated);
}

export const POST = route("summary/[id] POST", handlePOST);
