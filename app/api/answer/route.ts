import { NextResponse } from "next/server";
import { getSession, saveFile, updateSession } from "@/lib/store";
import { SarvamError, transcribe, translateToEnglish } from "@/lib/sarvam";
import { QUESTIONS } from "@/lib/i18n";
import type { Answer, Segment } from "@/lib/types";

const MAX_BYTES = 2 * 1024 * 1024; // 25 s of 16 kHz mono 16-bit WAV ≈ 0.8 MB
const MAX_SECONDS = 26;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  const sessionId = String(form.get("sessionId") ?? "");
  const index = Number(form.get("index"));
  const text = form.get("text");
  const file = form.get("file");

  const s = await getSession(sessionId);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (!s.consent.given) return NextResponse.json({ error: "Consent required" }, { status: 403 });
  if (s.status !== "in_progress") return NextResponse.json({ error: "Interview already finished" }, { status: 400 });
  if (!Number.isInteger(index) || index < 1 || index > QUESTIONS.length) return NextResponse.json({ error: "Invalid question" }, { status: 400 });

  let answer: Answer;
  const now = new Date().toISOString();

  if (typeof text === "string") {
    // Typed fallback: one whole-answer segment, no audio.
    const t = text.trim();
    if (!t) return NextResponse.json({ error: "Answer is empty" }, { status: 400 });
    answer = {
      index, inputType: "text", audioFile: null, durationSec: null, transcript: t, englishTranslation: null,
      languageCode: s.language, timestampsAvailable: false, segments: [{ id: `a${index}_s0`, text: t, start: null, end: null }], createdAt: now,
    };
  } else if (file instanceof Blob) {
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length < 1000) return NextResponse.json({ error: "Recording is empty — please try again" }, { status: 400 });
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Recording too large" }, { status: 413 });
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return NextResponse.json({ error: "Expected a WAV file" }, { status: 415 });
    const byteRate = buf.readUInt32LE(28);
    const duration = byteRate ? (buf.length - 44) / byteRate : 0;
    if (duration > MAX_SECONDS) return NextResponse.json({ error: `Recording is ${duration.toFixed(0)} s; the limit is 25 s` }, { status: 400 });

    const audioFile = await saveFile("wav", buf); // keep the original even if transcription fails
    let result;
    try {
      result = await transcribe(buf, s.language);
    } catch (e) {
      const msg = e instanceof SarvamError ? e.message : "Transcription failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    if (!result.transcript) return NextResponse.json({ error: "No speech detected — please speak and try again" }, { status: 422 });

    const segments: Segment[] = result.chunks
      ? result.chunks.map((c, i) => ({ id: `a${index}_s${i + 1}`, text: c.text, start: c.start, end: c.end }))
      : [{ id: `a${index}_s0`, text: result.transcript, start: null, end: null }];
    answer = {
      index, inputType: "voice", audioFile, durationSec: +duration.toFixed(2), transcript: result.transcript, englishTranslation: null,
      languageCode: result.languageCode ?? s.language, timestampsAvailable: !!result.chunks, segments, createdAt: now,
    };
  } else {
    return NextResponse.json({ error: "Provide an audio file or text" }, { status: 400 });
  }

  // Best-effort English translation for the doctor; the original transcript is always kept.
  try {
    answer.englishTranslation = await translateToEnglish(answer.transcript, s.language);
  } catch (e) {
    console.warn("[answer] translation failed:", (e as Error).message);
  }

  const updated = await updateSession(sessionId, (x) => {
    x.answers = x.answers.filter((a) => a.index !== index).concat(answer);
  });
  return NextResponse.json({ answer, session: updated });
}
