import { route } from "@/lib/route";
import { NextResponse } from "next/server";
import { createSession, newId, saveFile } from "@/lib/store";
import { tts } from "@/lib/sarvam";
import { concatWavs } from "@/lib/wavnode";
import { DEMO_ANSWERS, DEMO_FACTS, DEMO_PROMPTS } from "@/lib/demo";
import type { Answer, Session } from "@/lib/types";

export const maxDuration = 120;

async function handlePOST() {
  const now = new Date().toISOString();
  let audioError: string | null = null;
  const answers: Answer[] = [];

  for (const [i, a] of DEMO_ANSWERS.entries()) {
    const index = i + 1;
    let audioFile: string | null = null;
    let duration: number | null = null;
    let times: { start: number; end: number }[] | null = null;
    if (!audioError) {
      try {
        // Generate each phrase with Bulbul, then join; timestamps are measured from the real audio lengths.
        const clips = await Promise.all(a.segments.map((t) => tts(t, "od-IN")));
        const joined = concatWavs(clips);
        audioFile = await saveFile("wav", joined.wav);
        duration = joined.duration;
        times = joined.times;
      } catch (e) {
        audioError = (e as Error).message;
        console.warn("[demo] TTS failed, seeding without audio:", audioError);
      }
    }
    answers.push({
      index,
      inputType: audioFile ? "voice" : "text",
      audioFile,
      durationSec: duration,
      transcript: a.segments.join(" "),
      englishTranslation: a.english,
      languageCode: "od-IN",
      timestampsAvailable: !!times,
      segments: a.segments.map((text, j) => ({ id: `a${index}_s${j + 1}`, text, start: times?.[j].start ?? null, end: times?.[j].end ?? null })),
      createdAt: now,
    });
  }

  const s: Session = {
    id: newId(),
    token: "17",
    age: 52,
    language: "od-IN",
    consent: { given: true, at: now },
    status: "ready",
    demo: true,
    createdAt: now,
    answers,
    documents: [],
    summary: {
      generatedAt: now,
      model: "demo (pre-written, not model output)",
      facts: structuredClone(DEMO_FACTS),
      prompts: structuredClone(DEMO_PROMPTS),
      redFlags: [],
      dropped: { facts: 0, prompts: 0, redFlags: 0 },
    },
    summaryError: null,
    signoff: null,
  };
  await createSession(s);
  return NextResponse.json({ id: s.id, audioError });
}

export const POST = route("demo/seed POST", handlePOST);
