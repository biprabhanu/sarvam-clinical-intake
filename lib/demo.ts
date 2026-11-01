import type { Fact, DoctorPrompt } from "./types";

// Synthetic, role-played scenario: Odia-speaking farmer, token 17. Not a real patient.
export const DEMO_ANSWERS: { segments: string[]; english: string }[] = [
  { segments: ["ମୋର ଚାରି ଦିନ ହେଲା ଜ୍ୱର ହେଉଛି।", "ରାତିରେ ଜ୍ୱର ବେଶି ହୁଏ।"], english: "I have had fever for four days. The fever is worse at night." },
  { segments: ["ଗତ ସୋମବାରଠାରୁ।", "ପ୍ରଥମେ ଅଳ୍ପ ଥିଲା, ଏବେ ବଢ଼ିଯାଇଛି।"], english: "Since last Monday. It was mild at first, now it has increased." },
  { segments: ["ମୁଣ୍ଡ ବହୁତ ବିନ୍ଧୁଛି।", "ଦେହ, ହାତ, ଗୋଡ଼ ବି ବିନ୍ଧୁଛି।"], english: "My head hurts a lot. My body, arms and legs also ache." },
  { segments: ["ଗାଁ ଦୋକାନରୁ ପାରାସିଟାମଲ ଆଣି ଖାଇଛି।", "ଦିନକୁ ଦୁଇଥର ଖାଉଛି।"], english: "I bought paracetamol from the village shop and took it. I am taking it twice a day." },
  { segments: ["ମୋର ସୁଗାର ଅଛି।", "ମେଟଫର୍ମିନ ଔଷଧ ରୋଜ ଖାଏ।", "କୌଣସି ଆଲର୍ଜି ନାହିଁ।"], english: "I have sugar (diabetes). I take Metformin every day. No allergies." },
];

const fact = (id: string, category: Fact["category"], englishText: string, originalText: string, ids: string[]): Fact => ({
  id, category, englishText, originalText, originalTextVerbatim: true, sourceSegmentIds: ids, status: "pending", editedText: null,
});

export const DEMO_FACTS: Fact[] = [
  fact("f1", "symptom", "Fever for four days", "ମୋର ଚାରି ଦିନ ହେଲା ଜ୍ୱର ହେଉଛି।", ["a1_s1"]),
  fact("f2", "symptom", "Fever is worse at night", "ରାତିରେ ଜ୍ୱର ବେଶି ହୁଏ।", ["a1_s2"]),
  fact("f3", "duration", "Started last Monday; mild at first, now worsening", "ଗତ ସୋମବାରଠାରୁ। ପ୍ରଥମେ ଅଳ୍ପ ଥିଲା, ଏବେ ବଢ଼ିଯାଇଛି।", ["a2_s1", "a2_s2"]),
  fact("f4", "symptom", "Severe headache", "ମୁଣ୍ଡ ବହୁତ ବିନ୍ଧୁଛି।", ["a3_s1"]),
  fact("f5", "symptom", "Body ache, including arms and legs", "ଦେହ, ହାତ, ଗୋଡ଼ ବି ବିନ୍ଧୁଛି।", ["a3_s2"]),
  fact("f6", "medicine", "Paracetamol from village shop, twice a day — strength not stated", "ଗାଁ ଦୋକାନରୁ ପାରାସିଟାମଲ ଆଣି ଖାଇଛି। ଦିନକୁ ଦୁଇଥର ଖାଉଛି।", ["a4_s1", "a4_s2"]),
  fact("f7", "history", "Has diabetes (\"sugar\")", "ମୋର ସୁଗାର ଅଛି।", ["a5_s1"]),
  fact("f8", "medicine", "Takes Metformin daily — dose not stated", "ମେଟଫର୍ମିନ ଔଷଧ ରୋଜ ଖାଏ।", ["a5_s2"]),
  fact("f9", "allergy", "No known allergies", "କୌଣସି ଆଲର୍ଜି ନାହିଁ।", ["a5_s3"]),
];

export const DEMO_PROMPTS: DoctorPrompt[] = [
  { id: "p1", text: "Ask whether the fever comes with chills, sweating or a fixed daily pattern.", supportingFactIds: ["f1", "f2"], status: "pending" },
  { id: "p2", text: "Confirm the paracetamol strength and how many tablets were taken in total.", supportingFactIds: ["f6"], status: "pending" },
  { id: "p3", text: "Verify the Metformin dose and when blood sugar was last checked.", supportingFactIds: ["f7", "f8"], status: "pending" },
  { id: "p4", text: "Ask about recent travel or mosquito exposure.", supportingFactIds: ["f1"], status: "pending" },
];
