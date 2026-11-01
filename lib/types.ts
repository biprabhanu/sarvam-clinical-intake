export type Lang = "od-IN" | "hi-IN" | "mr-IN";
export type SessionStatus = "in_progress" | "generating" | "ready" | "signed_off";
export type FactCategory = "symptom" | "duration" | "medicine" | "history" | "allergy" | "other";
export type FactStatus = "pending" | "confirmed" | "edited" | "rejected";
export type PromptStatus = "pending" | "asked" | "dismissed";

export interface Segment {
  id: string; // e.g. a2_s1 ; a2_s0 = whole answer (no timestamps)
  text: string;
  start: number | null; // seconds, only from Saaras (or measured from generated demo audio)
  end: number | null;
}

export interface Answer {
  index: number; // 1-based question number
  inputType: "voice" | "text";
  audioFile: string | null;
  durationSec: number | null;
  transcript: string;
  englishTranslation: string | null;
  languageCode: string;
  timestampsAvailable: boolean;
  segments: Segment[];
  createdAt: string;
}

export interface Fact {
  id: string;
  category: FactCategory;
  englishText: string;
  originalText: string;
  originalTextVerbatim: boolean; // true if model's phrase was found in the source segment(s)
  sourceSegmentIds: string[];
  status: FactStatus;
  editedText: string | null;
}

export interface DoctorPrompt {
  id: string;
  text: string;
  supportingFactIds: string[];
  status: PromptStatus;
}

export interface RedFlag {
  segmentId: string;
  reason: string;
}

export interface Summary {
  generatedAt: string;
  model: string;
  facts: Fact[];
  prompts: DoctorPrompt[];
  redFlags: RedFlag[];
  dropped: { facts: number; prompts: number; redFlags: number };
}

export interface DocumentFile {
  id: string;
  file: string;
  originalName: string;
  uploadedAt: string;
}

export interface Session {
  id: string;
  token: string;
  age: number | null;
  language: Lang;
  consent: { given: boolean; at: string | null };
  status: SessionStatus;
  demo: boolean;
  createdAt: string;
  answers: Answer[];
  documents: DocumentFile[];
  summary: Summary | null;
  summaryError: string | null;
  generatingSince?: string | null; // set while the summary is being generated
  signoff: { doctorId: string; at: string } | null;
}
