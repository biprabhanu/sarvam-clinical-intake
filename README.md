# Listen, Understand — multilingual OPD intake (hackathon prototype)
Patients answer 5 questions by voice in Odia / Hindi / Marathi; doctors get an evidence-linked English summary (every fact has a ▶ to its source audio) plus AI prompts for verification only, then confirm / edit / reject and sign off.

**Run:** `cp .env.example .env.local`, add `SARVAM_API_KEY`, then `npm install && npm run dev` → http://localhost:3000. Use **Load demo session** for an offline-safe walkthrough (token 17, Odia farmer).

**Sarvam APIs:** Saaras v4 speech-to-text (with phrase timestamps), sarvam-translate:v1 (English gloss of transcripts), Sarvam-105B chat for the structured summary, Bulbul v3 TTS (demo audio only). Keys stay server-side in `lib/sarvam.ts`.

**Evidence guarantee (`lib/summary.ts`):** facts citing unknown segment IDs are dropped, prompts citing dropped facts are dropped, red flags must cite a real segment, quotes not found verbatim are replaced by the real segment text, and timestamps always come from stored Saaras data, never from the model.

**Data:** `data/sessions.json` plus `data/files/` (audio and images, outside `public/`, served via `/api/files`). The doctor's 🗑 button deletes a session and its files.

**Notes / limits:** The LLM defaults to `sarvam-105b-conversations`, because `sarvam-105b` spent its whole token budget on reasoning in testing. Override with `SARVAM_LLM_MODEL`. Prescription photos are stored and shown but not OCR'd. Red flags rely on the LLM and are only checked after the interview ends. There are no auth, tests or retention policy. Not a medical device; use synthetic data only.
