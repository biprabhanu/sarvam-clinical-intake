// Server-only Sarvam client. Never import this from a client component.
import "server-only";

const BASE = "https://api.sarvam.ai";

export class SarvamError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new SarvamError("SARVAM_API_KEY is not set in .env.local");
  return k;
}

async function call(path: string, init: RequestInit, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { "api-subscription-key": key(), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = (e as Error).name;
    throw new SarvamError(name === "TimeoutError" ? "Sarvam request timed out" : `Network error: ${(e as Error).message}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error?.message ?? res.statusText;
    const hint =
      res.status === 403 ? " (invalid API key?)" : res.status === 429 ? " (rate limited — wait and retry)" : "";
    throw new SarvamError(`Sarvam ${res.status}: ${msg}${hint}`, res.status);
  }
  return body;
}

export interface TranscribeResult {
  transcript: string;
  languageCode: string | null;
  chunks: { text: string; start: number; end: number }[] | null;
}

let loggedRaw = false;

export async function transcribe(wav: Buffer, languageCode: string): Promise<TranscribeResult> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "answer.wav");
  fd.append("model", process.env.SARVAM_STT_MODEL || "saaras:v4");
  fd.append("language_code", languageCode);
  fd.append("with_timestamps", "true");
  const j = await call("/speech-to-text", { method: "POST", body: fd }, 45_000);
  if (!loggedRaw) {
    loggedRaw = true;
    console.log("[sarvam] first raw STT response:", JSON.stringify(j));
  }
  const transcript = typeof j?.transcript === "string" ? j.transcript.trim() : "";
  let chunks: TranscribeResult["chunks"] = null;
  const t = j?.timestamps;
  if (
    t &&
    Array.isArray(t.words) &&
    Array.isArray(t.start_time_seconds) &&
    Array.isArray(t.end_time_seconds) &&
    t.words.length > 0 &&
    t.words.length === t.start_time_seconds.length &&
    t.words.length === t.end_time_seconds.length
  ) {
    chunks = t.words
      .map((w: unknown, i: number) => ({
        text: String(w).trim(),
        start: Number(t.start_time_seconds[i]),
        end: Number(t.end_time_seconds[i]),
      }))
      .filter((c: { text: string; start: number; end: number }) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end));
    if (chunks!.length === 0) chunks = null;
  }
  return { transcript, languageCode: j?.language_code ?? null, chunks };
}

export async function chat(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const model = process.env.SARVAM_LLM_MODEL || "sarvam-105b-conversations";
  const j = await call(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4000 }),
    },
    120_000,
  );
  const content = j?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new SarvamError(`Model returned no content (finish_reason: ${j?.choices?.[0]?.finish_reason ?? "unknown"})`);
  }
  return { content, model };
}

export async function translateToEnglish(text: string, source: string): Promise<string> {
  const j = await call(
    "/translate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: text.slice(0, 2000),
        source_language_code: source,
        target_language_code: "en-IN",
        model: "sarvam-translate:v1",
      }),
    },
    30_000,
  );
  if (typeof j?.translated_text !== "string") throw new SarvamError("Translate returned no text");
  return j.translated_text;
}

/** Bulbul v3 TTS → WAV buffer (16 kHz). */
export async function tts(text: string, languageCode: string, speaker = "rupali"): Promise<Buffer> {
  const j = await call(
    "/text-to-speech",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        model: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
        speaker,
        speech_sample_rate: 16000,
      }),
    },
    30_000,
  );
  const b64 = j?.audios?.[0];
  if (typeof b64 !== "string") throw new SarvamError("TTS returned no audio");
  return Buffer.from(b64, "base64");
}
