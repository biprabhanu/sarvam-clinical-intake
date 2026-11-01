"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileImage, Keyboard, Loader2, Mic, RotateCcw, Square, Upload } from "lucide-react";
import { LANGS, QUESTIONS, UI } from "@/lib/i18n";
import { blobToWav16k } from "@/lib/wav";
import { downscaleImage } from "@/lib/image";
import { apiFetch } from "@/lib/api-client";
import type { Answer, Lang, Session } from "@/lib/types";

const MAX_SEC = 25;
type Step = "checkin" | "consent" | "interview" | "document" | "done";

export default function PatientPage() {
  const [step, setStep] = useState<Step>("checkin");
  const [token, setToken] = useState("");
  const [age, setAge] = useState("");
  const [lang, setLang] = useState<Lang>("od-IN");
  const [agreed, setAgreed] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [q, setQ] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSession() {
    setBusy(true);
    setError(null);
    const r = await apiFetch<Session>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, age, language: lang, consent: agreed }),
    });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error);
    setSession(r.data);
    setStep("interview");
  }

  async function finish() {
    if (!session) return;
    setBusy(true);
    setError(null);
    // The server marks the session "generating" and builds the summary after responding.
    const r = await apiFetch<Session>(`/api/sessions/${session.id}/finish`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStep("done");
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-200">
        <Link href="/" className="font-semibold text-brand text-lg">Listen, Understand</Link>
        {session && <span className="text-slate-500">Token {session.token}</span>}
      </header>

      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-10">
          {step === "checkin" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-semibold">Welcome</h1>
              <label className="block">
                <span className="text-slate-600">Token number</span>
                <input value={token} onChange={(e) => setToken(e.target.value)} inputMode="numeric" className="mt-1 w-full text-2xl rounded-xl border border-slate-300 px-4 py-3 focus:outline-brand" />
              </label>
              <label className="block">
                <span className="text-slate-600">Age</span>
                <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="mt-1 w-full text-2xl rounded-xl border border-slate-300 px-4 py-3 focus:outline-brand" />
              </label>
              <div>
                <span className="text-slate-600">Language / ଭାଷା / भाषा</span>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {LANGS.map((l) => (
                    <button key={l.code} onClick={() => setLang(l.code)} className={`rounded-2xl border-2 py-4 flex flex-col items-center ${lang === l.code ? "border-brand bg-teal-50" : "border-slate-200"}`}>
                      <span className="text-2xl font-medium">{l.native}</span>
                      <span className="text-sm text-slate-500">{l.english}</span>
                    </button>
                  ))}
                </div>
              </div>
              <BigButton disabled={!token.trim()} onClick={() => setStep("consent")}>Continue <ArrowRight /></BigButton>
            </div>
          )}

          {step === "consent" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-semibold">Consent</h1>
              <p className="text-slate-600">Your answers will be recorded so your doctor can listen to them. No name is collected. You can stop at any time.</p>
              <label className="flex gap-4 items-start rounded-2xl border-2 border-slate-200 p-5 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-teal-50">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-7 h-7 accent-brand" />
                <span>
                  <span className="block text-xl">{UI[lang].consent}</span>
                  <span className="block text-slate-500 mt-1">I agree to my voice being recorded for my doctor.</span>
                </span>
              </label>
              {error && <p className="text-red-600">{error}</p>}
              <BigButton disabled={!agreed || busy} onClick={startSession}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Start interview
              </BigButton>
            </div>
          )}

          {step === "interview" && session && (
            <QuestionStep
              key={q}
              session={session}
              index={q}
              existing={session.answers.find((a) => a.index === q + 1) ?? null}
              onSaved={(s) => setSession(s)}
              onNext={() => (q + 1 < QUESTIONS.length ? setQ(q + 1) : setStep("document"))}
              onBack={q > 0 ? () => setQ(q - 1) : undefined}
            />
          )}

          {step === "document" && session && <DocumentStep session={session} onSaved={setSession} onFinish={finish} finishing={busy} finishError={error} />}

          {step === "done" && session && (
            <div className="text-center space-y-4 py-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Check className="w-8 h-8" /></div>
              <p className="text-2xl">{UI[session.language].thanks}</p>
              <p className="text-slate-500">Thank you, please wait for your token to be called.</p>
              <p className="text-5xl font-semibold text-brand">{session.token}</p>
              <button onClick={() => location.reload()} className="text-brand underline">New patient</button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function BigButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} className={`w-full rounded-2xl bg-brand text-white text-xl font-medium py-4 flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-brand-dark transition ${p.className ?? ""}`}>
      {children}
    </button>
  );
}

function QuestionStep({ session, index, existing, onSaved, onNext, onBack }: {
  session: Session; index: number; existing: Answer | null;
  onSaved: (s: Session) => void; onNext: () => void; onBack?: () => void;
}) {
  const question = QUESTIONS[index];
  const [mode, setMode] = useState<"idle" | "recording" | "recorded" | "uploading">("idle");
  const [seconds, setSeconds] = useState(0);
  const [wav, setWav] = useState<{ blob: Blob; url: string; duration: number } | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(existing);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError(null);
    setAnswer(null);
    setWav(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("Microphone not available. Please allow microphone access, or type your answer.");
    }
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      try {
        const { wav, duration, peak } = await blobToWav16k(new Blob(chunks, { type: mr.mimeType }));
        if (duration < 0.5) { setMode("idle"); return setError("Recording too short — please try again."); }
        if (peak < 0.003) {
          setMode("idle");
          return setError("No sound reached the microphone (the recording is silent). Check that the microphone is allowed for this browser and not muted, then try again — or type your answer.");
        }
        setWav({ blob: wav, url: URL.createObjectURL(wav), duration });
        setMode("recorded");
      } catch {
        setMode("idle");
        setError("Could not process the recording. Please try again or type your answer.");
      }
    };
    rec.current = mr;
    mr.start();
    setSeconds(0);
    setMode("recording");
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSeconds(s);
      if (s >= MAX_SEC && mr.state === "recording") mr.stop(); // hard 25 s limit
    }, 200);
  }

  const stop = () => rec.current?.state === "recording" && rec.current.stop();

  async function submit(body: FormData) {
    setMode("uploading");
    setError(null);
    body.append("sessionId", session.id);
    body.append("index", String(index + 1));
    const r = await apiFetch<{ answer: Answer; session: Session }>("/api/answer", { method: "POST", body });
    if (!r.ok || !r.data) {
      setError(`${(r.error ?? "Upload failed").replace(/[.\s]+$/, "")}. You can retry, re-record, or type your answer.`);
      setMode(wav ? "recorded" : "idle");
      return;
    }
    setAnswer(r.data.answer);
    onSaved(r.data.session);
    setTyping(false);
    setMode("idle");
  }

  const sendAudio = () => { if (!wav) return; const f = new FormData(); f.append("file", wav.blob, "answer.wav"); submit(f); };
  const sendText = () => { const f = new FormData(); f.append("text", typed); submit(f); };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between text-sm text-slate-500 mb-2">
          <span>Question {index + 1} of {QUESTIONS.length}</span>
          {onBack && <button onClick={onBack} className="underline">Back</button>}
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-brand transition-all" style={{ width: `${((index + (answer ? 1 : 0)) / QUESTIONS.length) * 100}%` }} />
        </div>
      </div>
      <div>
        <h2 className="text-2xl sm:text-3xl font-medium leading-snug">{question.text[session.language]}</h2>
        <p className="mt-2 text-slate-500">{question.en}</p>
      </div>

      {!typing && (
        <div className="flex flex-col items-center gap-3 py-2">
          {mode === "recording" ? (
            <button onClick={stop} className="w-32 h-32 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg ring-8 ring-red-100 animate-pulse" aria-label="Stop recording">
              <Square className="w-12 h-12" fill="currentColor" />
            </button>
          ) : (
            <button onClick={start} disabled={mode === "uploading"} className="w-32 h-32 rounded-full bg-brand text-white flex items-center justify-center shadow-lg ring-8 ring-teal-50 disabled:opacity-40" aria-label="Start recording">
              <Mic className="w-14 h-14" />
            </button>
          )}
          <p className="text-slate-600 text-lg">
            {mode === "recording" ? <span className="text-red-600 font-medium">● {Math.floor(seconds)}s / {MAX_SEC}s</span> : UI[session.language].speak}
          </p>
        </div>
      )}

      {wav && mode !== "recording" && !typing && (
        <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
          <audio src={wav.url} controls className="w-full" />
          {!answer && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={start} disabled={mode === "uploading"} className="rounded-xl border border-slate-300 py-3 text-lg flex items-center justify-center gap-2"><RotateCcw className="w-5 h-5" /> Re-record</button>
              <button onClick={sendAudio} disabled={mode === "uploading"} className="rounded-xl bg-brand text-white py-3 text-lg flex items-center justify-center gap-2 disabled:opacity-60">
                {mode === "uploading" ? <><Loader2 className="w-5 h-5 animate-spin" /> Transcribing…</> : <>Submit <ArrowRight className="w-5 h-5" /></>}
              </button>
            </div>
          )}
        </div>
      )}

      {typing && (
        <div className="space-y-3">
          <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 p-3 text-lg" placeholder="Type your answer in any language" />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setTyping(false)} className="rounded-xl border border-slate-300 py-3 text-lg">Use voice</button>
            <button onClick={sendText} disabled={!typed.trim() || mode === "uploading"} className="rounded-xl bg-brand text-white py-3 text-lg disabled:opacity-40">
              {mode === "uploading" ? "Saving…" : "Save answer"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3">{error}</p>}

      {answer && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800 font-medium mb-1">{answer.inputType === "voice" ? "We heard:" : "Your answer:"}</p>
          <p className="text-xl">{answer.transcript}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {!typing && mode !== "recording" ? (
          <button onClick={() => setTyping(true)} className="text-slate-500 flex items-center gap-2 underline"><Keyboard className="w-4 h-4" /> Type instead</button>
        ) : <span />}
        {answer ? (
          <BigButton onClick={onNext} className="!w-auto px-8">Next <ArrowRight /></BigButton>
        ) : (
          <button onClick={onNext} disabled={mode === "recording" || mode === "uploading"} className="text-slate-400 underline">Skip</button>
        )}
      </div>
    </div>
  );
}

function DocumentStep({ session, onSaved, onFinish, finishing, finishError }: { session: Session; onSaved: (s: Session) => void; onFinish: () => void; finishing: boolean; finishError: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    let photo: Blob;
    try {
      photo = await downscaleImage(f);
    } catch {
      setBusy(false);
      return setError("Could not read this image. Please take the photo again as JPG or PNG.");
    }
    const fd = new FormData();
    fd.append("sessionId", session.id);
    fd.append("file", photo, "prescription.jpg");
    const r = await apiFetch<Session>("/api/document", { method: "POST", body: fd });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error);
    onSaved(r.data);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold flex items-center gap-2"><FileImage className="text-brand" /> Old prescription (optional)</h2>
      <p className="text-slate-600">If you have an old prescription or report, take a photo of it. Your doctor will see it.</p>
      <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-10 cursor-pointer hover:bg-slate-50">
        {busy ? <Loader2 className="w-8 h-8 animate-spin text-brand" /> : <Upload className="w-8 h-8 text-brand" />}
        <span className="text-lg">Take photo / choose image</span>
        <span className="text-sm text-slate-400">JPG or PNG, up to 4 MB</span>
        <input type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {session.documents.length > 0 && <p className="text-emerald-700 flex items-center gap-2"><Check className="w-5 h-5" /> {session.documents.length} image(s) uploaded</p>}
      {(error || finishError) && <p className="text-red-600">{error ?? finishError}</p>}
      <BigButton onClick={onFinish} disabled={busy || finishing}>{finishing ? <Loader2 className="animate-spin" /> : <Check />} Finish</BigButton>
    </div>
  );
}
