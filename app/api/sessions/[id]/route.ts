import { route } from "@/lib/route";
import { NextResponse } from "next/server";
import { deleteSession, getSession, updateSession } from "@/lib/store";
import type { FactStatus, PromptStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

async function handleGET(_: Request, { params }: Ctx) {
  const s = await getSession((await params).id);
  return s ? NextResponse.json(s) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function handleDELETE(_: Request, { params }: Ctx) {
  const ok = await deleteSession((await params).id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const FACT_STATUSES: FactStatus[] = ["pending", "confirmed", "edited", "rejected"];
const PROMPT_STATUSES: PromptStatus[] = ["pending", "asked", "dismissed"];

/** Doctor review actions: fact status/edit, prompt status, sign-off. */
async function handlePATCH(req: Request, { params }: Ctx) {
  const id = (await params).id;
  const b = await req.json().catch(() => ({}));
  let error: string | null = null;
  const s = await updateSession(id, (s) => {
    error = null; // fn may re-run on a concurrent-write retry
    if (s.signoff) { error = "Summary is already signed off and locked"; return; }
    if (!s.summary) { error = "No summary to review"; return; }
    if (b.action === "fact") {
      const f = s.summary.facts.find((x) => x.id === b.factId);
      if (!f || !FACT_STATUSES.includes(b.status)) { error = "Invalid fact update"; return; }
      if (b.status === "edited") {
        const t = String(b.editedText ?? "").trim();
        if (!t) { error = "Edited text is empty"; return; }
        f.editedText = t; // original AI englishText is kept for audit
      }
      f.status = b.status;
    } else if (b.action === "prompt") {
      const p = s.summary.prompts.find((x) => x.id === b.promptId);
      if (!p || !PROMPT_STATUSES.includes(b.status)) { error = "Invalid prompt update"; return; }
      p.status = b.status;
    } else if (b.action === "signoff") {
      const doctorId = String(b.doctorId ?? "").trim();
      if (!doctorId) { error = "Doctor ID is required"; return; }
      const unverified = s.summary.facts.filter((f) => f.needsVerification && f.status === "pending").length;
      if (unverified) { error = `${unverified} fact(s) need verification (quote not found in source) — confirm, edit or reject them before sign-off`; return; }
      const pending = s.summary.facts.filter((f) => f.status === "pending").length;
      if (pending) { error = `${pending} fact(s) still pending review — confirm, edit or reject each before sign-off`; return; }
      s.signoff = { doctorId, at: new Date().toISOString() };
      s.status = "signed_off";
    } else error = "Unknown action";
  });
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json(s);
}

export const GET = route("sessions/[id] GET", handleGET);
export const DELETE = route("sessions/[id] DELETE", handleDELETE);
export const PATCH = route("sessions/[id] PATCH", handlePATCH);
