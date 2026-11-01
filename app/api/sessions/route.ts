import { route } from "@/lib/route";
import { NextResponse } from "next/server";
import { createSession, listSessions, newId } from "@/lib/store";
import { LANGS } from "@/lib/i18n";
import type { Lang, Session } from "@/lib/types";

async function handleGET() {
  const all = await listSessions();
  return NextResponse.json(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

async function handlePOST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token ?? "").trim();
  const age = b.age === "" || b.age == null ? null : Number(b.age);
  const language = b.language as Lang;
  if (!token || token.length > 12) return NextResponse.json({ error: "Token number is required" }, { status: 400 });
  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) return NextResponse.json({ error: "Invalid age" }, { status: 400 });
  if (!LANGS.some((l) => l.code === language)) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  if (b.consent !== true) return NextResponse.json({ error: "Consent is required before recording" }, { status: 400 });
  const s: Session = {
    id: newId(),
    token,
    age,
    language,
    consent: { given: true, at: new Date().toISOString() },
    status: "in_progress",
    demo: false,
    createdAt: new Date().toISOString(),
    answers: [],
    documents: [],
    summary: null,
    summaryError: null,
    signoff: null,
  };
  await createSession(s);
  return NextResponse.json(s);
}

export const GET = route("sessions GET", handleGET);
export const POST = route("sessions POST", handlePOST);
