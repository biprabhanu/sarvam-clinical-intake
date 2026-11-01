import "server-only";
import { getSession, updateSession } from "./store";
import { chat, SarvamError } from "./sarvam";
import { buildUserPrompt, extractJson, SYSTEM_PROMPT, validateSummary } from "./summary";
import type { Session, Summary } from "./types";

export const STUCK_AFTER_MS = 3 * 60 * 1000;

/** Mark a session as generating (shown to the doctor; detects stuck jobs). */
export const markGenerating = (id: string) =>
  updateSession(id, (x) => {
    x.status = "generating";
    x.generatingSince = new Date().toISOString();
    x.summaryError = null;
  });

/**
 * Generate + validate the summary with Sarvam-105B and store the result (or a clear error).
 * Always leaves the session in "ready" so the doctor can review or retry.
 */
export async function generateSummary(id: string): Promise<{ session: Session | null; error: string | null }> {
  const s = await getSession(id);
  if (!s) return { session: null, error: "Session not found" };
  if (s.signoff) return { session: s, error: "Already signed off" };
  if (s.answers.length === 0) {
    const session = await updateSession(id, (x) => { x.status = "ready"; x.generatingSince = null; x.summaryError = "No answers were recorded."; });
    return { session, error: "No answers were recorded" };
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
      console.warn(`[summary ${id}] attempt ${attempt} failed:`, lastError);
      if (e instanceof SarvamError && (e.status === 403 || e.status === undefined)) break; // bad/missing key won't fix itself
    }
  }

  const session = await updateSession(id, (x) => {
    if (x.signoff) return;
    x.status = "ready";
    x.generatingSince = null;
    if (summary) { x.summary = summary; x.summaryError = null; }
    else x.summaryError = `Summary generation failed — ${lastError}`;
  });
  return { session, error: summary ? null : session?.summaryError ?? lastError };
}
