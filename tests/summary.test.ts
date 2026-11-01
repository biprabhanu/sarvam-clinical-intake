import { describe, expect, it } from "vitest";
import { extractJson, validateSummary } from "@/lib/summary";
import type { Session } from "@/lib/types";

const s = {
  language: "hi-IN",
  answers: [
    { index: 1, segments: [{ id: "a1_s1", text: "मुझे बुखार नहीं है।", start: 0, end: 2 }] },
    { index: 5, segments: [{ id: "a5_s1", text: "मेरे पिताजी को पिछले साल सीने में दर्द था।", start: 0, end: 3 }] },
  ],
} as unknown as Session;

const raw = (facts: unknown[], doctorPrompts: unknown[] = [], redFlags: unknown[] = []) => ({ facts, doctorPrompts, redFlags });

describe("validateSummary", () => {
  it("keeps a quote that is not in the source but flags it for verification", () => {
    const v = validateSummary(raw([{ id: "f1", category: "symptom", englishText: "Has a cough", originalText: "मुझे खांसी है", sourceSegmentIds: ["a1_s1"] }]), s, "m");
    expect(v.facts).toHaveLength(1);
    expect(v.facts[0]).toMatchObject({ originalText: "मुझे खांसी है", needsVerification: true, verificationReason: "Quote not found in source" });
  });

  it("does not flag a verbatim quote", () => {
    const v = validateSummary(raw([{ id: "f1", category: "negative", englishText: "No fever", originalText: "बुखार नहीं है", sourceSegmentIds: ["a1_s1"] }]), s, "m");
    expect(v.facts[0]).toMatchObject({ category: "negative", needsVerification: false, verificationReason: null });
  });

  it("keeps negative and family_history facts with valid sources", () => {
    const v = validateSummary(raw([
      { id: "f1", category: "negative", englishText: "No fever", originalText: "मुझे बुखार नहीं है", sourceSegmentIds: ["a1_s1"] },
      { id: "f2", category: "family_history", englishText: "Father had chest pain last year", originalText: "मेरे पिताजी को पिछले साल सीने में दर्द था", sourceSegmentIds: ["a5_s1"] },
    ]), s, "m");
    expect(v.facts.map((f) => f.category)).toEqual(["negative", "family_history"]);
    expect(v.dropped.facts).toBe(0);
  });

  it("drops facts with unknown or missing sources and prompts that depend on them", () => {
    const v = validateSummary(raw(
      [
        { id: "f1", category: "symptom", englishText: "Invented", originalText: "x", sourceSegmentIds: ["a9_s1"] },
        { id: "f2", category: "symptom", englishText: "No source", originalText: "y", sourceSegmentIds: [] },
      ],
      [{ id: "p1", text: "Ask about it", supportingFactIds: ["f1"] }],
      [{ segmentId: "a7_s2", reason: "made up" }],
    ), s, "m");
    expect(v.facts).toHaveLength(0);
    expect(v.prompts).toHaveLength(0);
    expect(v.redFlags).toHaveLength(0);
    expect(v.dropped).toEqual({ facts: 2, prompts: 1, redFlags: 1 });
  });

  it("never copies timestamps from the model", () => {
    const v = validateSummary(raw([{ id: "f1", category: "negative", englishText: "No fever", originalText: "बुखार नहीं", sourceSegmentIds: ["a1_s1"], start: 99, end: 100 }]), s, "m");
    expect(v.facts[0]).not.toHaveProperty("start");
  });

  it("extracts JSON from fenced model output", () => {
    expect(extractJson('Sure!\n```json\n{"facts":[]}\n```')).toEqual({ facts: [] });
  });
});
