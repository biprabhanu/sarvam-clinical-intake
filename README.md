# Listen, Understand — multilingual OPD intake (hackathon prototype)
Patients answer 5 questions by voice in Odia / Hindi / Marathi. Doctors get an evidence-linked English summary where every fact has a ▶ to its source audio, plus AI prompts for verification only. The doctor confirms, edits or rejects each fact, then signs off. Live: https://sarvam-clinical-intake.vercel.app (team passcode required).

**Run locally:** `cp .env.example .env.local`, set `SARVAM_API_KEY`, then `npm install && npm run dev` → http://localhost:3000. Without `APP_PASSCODE` the local app is open; data goes to `data/` on disk. **Tests:** `npm test` (Vitest, no network).

**Deploy (Vercel):** connect a *private* Blob store (adds `BLOB_READ_WRITE_TOKEN`), then set `SARVAM_API_KEY`, `APP_PASSCODE` and `SESSION_SECRET` (32+ random chars). Production refuses to run without a passcode and never falls back to local disk.

**Sarvam APIs:** Saaras v4 speech-to-text with phrase timestamps; sarvam-translate:v1 for English glosses; `sarvam-105b-conversations` for the structured summary (`sarvam-105b` used up its token budget on reasoning in testing; override with `SARVAM_LLM_MODEL`); Bulbul v3 for demo audio. Keys stay server-side.

**Evidence guarantee (`lib/summary.ts`):**
- Facts citing unknown segments are dropped, and so are prompts citing dropped facts.
- Quotes not found in the source are flagged "needs verification" and block sign-off until reviewed.
- Denials and family history get their own categories.
- Timestamps always come from Saaras, never from the model.

**Storage (`lib/store.ts`):** one private blob per session, updated with ETag `ifMatch` and retries (409 after 5 conflicts). Files are served only through authenticated `/api/files`. Deleting a session removes its files.

**Limits:**
- One shared passcode for everyone; no per-user accounts or audit log.
- Prescription photos are stored and shown but not OCR'd.
- Red flags rely on the LLM after the interview.
- No retention policy.
- Not a medical device, not clinically validated, not DPDP-compliant. Use synthetic data only.
