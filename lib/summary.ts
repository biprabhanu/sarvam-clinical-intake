import { QUESTIONS, langName } from "./i18n";
import type { DoctorPrompt, Fact, FactCategory, RedFlag, Session, Summary } from "./types";

const CATEGORIES: FactCategory[] = ["symptom", "duration", "medicine", "history", "allergy", "other"];

export const SYSTEM_PROMPT = `You are a clinical intake scribe for an Indian hospital OPD. You structure what a patient said so a doctor can review it.
Return STRICT JSON only — no markdown, no commentary — with exactly this shape:
{"facts":[{"id":"f1","category":"symptom|duration|medicine|history|allergy|other","englishText":"short English fact","originalText":"exact phrase copied from the source segment, in the original language","sourceSegmentIds":["a1_s1"]}],
 "doctorPrompts":[{"id":"p1","text":"question for the doctor to ask or something to verify","supportingFactIds":["f1"]}],
 "redFlags":[{"segmentId":"a1_s1","reason":"short reason"}]}
Rules:
- Extract ONLY what the patient actually said. Every fact must cite the segment IDs it came from. Never add facts that are not in the segments.
- Keep uncertainty: if the patient did not state a dose, strength or duration, say "not stated" rather than guessing. Do not correct or guess medicine names; keep them as heard.
- Never diagnose, never give disease probabilities, never suggest treatment or medicines. Doctor prompts are only questions to ask or details to verify, each citing the fact IDs it relies on.
- redFlags: only the patient's OWN CURRENT potentially urgent symptoms — chest pain, difficulty breathing, fainting/unconsciousness, heavy bleeding, seizure, sudden weakness or speech difficulty. Ignore clear negations ("no chest pain"), clearly past resolved events, and symptoms of family members. If unsure, INCLUDE it — over-alerting the nurse is better than missing an emergency.
- If there are no red flags, return "redFlags": [].`;

export function buildUserPrompt(s: Session): string {
  const answers = s.answers
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((a) => ({
      question: QUESTIONS[a.index - 1]?.en ?? `Question ${a.index}`,
      originalTranscript: a.transcript,
      englishMachineTranslation: a.englishTranslation,
      segments: a.segments.map((g) => ({ id: g.id, text: g.text })),
    }));
  return `Patient language: ${langName(s.language)} (${s.language}). Age: ${s.age ?? "not given"}.
Interview answers (cite segment ids exactly as given):
${JSON.stringify(answers, null, 1)}`;
}

/** Pull the JSON object out of a model reply (handles ```json fences or surrounding text). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(body.slice(start, end + 1));
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const norm = (t: string) => t.replace(/[\s।,.!?'"“”‘’-]+/g, "");

/**
 * The evidence guarantee. Drops anything that does not point to real stored material.
 * Timestamps are never read from the model — the UI looks them up from stored segments.
 */
export function validateSummary(raw: unknown, s: Session, model: string): Summary {
  if (!raw || typeof raw !== "object") throw new Error("Model JSON is not an object");
  const r = raw as Record<string, unknown>;
  const segText = new Map<string, string>();
  s.answers.forEach((a) => a.segments.forEach((g) => segText.set(g.id, g.text)));

  const rawFacts = Array.isArray(r.facts) ? r.facts : [];
  const facts: Fact[] = [];
  const idMap = new Map<string, string>();
  for (const f of rawFacts as Record<string, unknown>[]) {
    const englishText = str(f?.englishText);
    const ids = [...new Set(strArr(f?.sourceSegmentIds))];
    if (!englishText || ids.length === 0 || !ids.every((id) => segText.has(id))) continue;
    const id = `f${facts.length + 1}`;
    if (str(f?.id)) idMap.set(str(f.id), id);
    const sourceText = ids.map((i) => segText.get(i)!).join(" ");
    const claimed = str(f?.originalText);
    const verbatim = !!claimed && norm(sourceText).includes(norm(claimed));
    // Keep the model's quote as-is but flag it, so a model-invented fact never looks verified.
    const verificationReason = !claimed ? "No original-language quote given" : verbatim ? null : "Quote not found in source";
    const cat = str(f?.category).toLowerCase() as FactCategory;
    facts.push({
      id,
      category: CATEGORIES.includes(cat) ? cat : "other",
      englishText,
      originalText: claimed,
      needsVerification: verificationReason !== null,
      verificationReason,
      sourceSegmentIds: ids,
      status: "pending",
      editedText: null,
    });
  }

  const rawPrompts = Array.isArray(r.doctorPrompts) ? r.doctorPrompts : [];
  const prompts: DoctorPrompt[] = [];
  for (const p of rawPrompts as Record<string, unknown>[]) {
    const text = str(p?.text);
    const refs = strArr(p?.supportingFactIds);
    if (!text || refs.length === 0 || !refs.every((x) => idMap.has(x))) continue;
    prompts.push({ id: `p${prompts.length + 1}`, text, supportingFactIds: [...new Set(refs.map((x) => idMap.get(x)!))], status: "pending" });
  }

  const rawFlags = Array.isArray(r.redFlags) ? r.redFlags : [];
  const redFlags: RedFlag[] = [];
  for (const f of rawFlags as Record<string, unknown>[]) {
    const segmentId = str(f?.segmentId);
    if (!segText.has(segmentId)) continue;
    redFlags.push({ segmentId, reason: str(f?.reason) || "Possible urgent symptom" });
  }

  return {
    generatedAt: new Date().toISOString(),
    model,
    facts,
    prompts,
    redFlags,
    dropped: { facts: rawFacts.length - facts.length, prompts: rawPrompts.length - prompts.length, redFlags: rawFlags.length - redFlags.length },
  };
}
