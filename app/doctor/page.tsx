"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BadgeCheck, Check, ChevronDown, FileImage, Loader2, MessageSquareText, Pause, Pencil, Play,
  RefreshCw, ShieldCheck, Trash2, X,
} from "lucide-react";
import { QUESTIONS, langName } from "@/lib/i18n";
import type { Answer, DoctorPrompt, Fact, Segment, Session } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const STATUS_LABEL = { in_progress: "In progress", generating: "Generating summary", ready: "Ready for review", signed_off: "Signed off" } as const;
const STUCK_AFTER_MS = 3 * 60 * 1000;
const missingAnswers = (s: Session) => QUESTIONS.map((_, i) => i + 1).filter((n) => !s.answers.some((a) => a.index === n));

/* ---------- evidence player: one shared <audio>, blob URLs so seeking always works ---------- */
function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const stopAt = useRef<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null); // segment id
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const a = new Audio();
    const cache = urls.current;
    audio.current = a;
    a.ontimeupdate = () => { if (stopAt.current !== null && a.currentTime >= stopAt.current) a.pause(); };
    a.onpause = a.onended = () => setPlaying(null);
    return () => { a.pause(); cache.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const play = useCallback(async (file: string, key: string, start: number | null, end: number | null) => {
    const a = audio.current!;
    if (playing === key) { a.pause(); return; }
    setErr(null);
    try {
      let url = urls.current.get(file);
      if (!url) {
        const r = await fetch(`/api/files/${file}`);
        if (!r.ok) throw new Error(r.status === 401 ? "Please log in again" : "Audio file not found");
        url = URL.createObjectURL(await r.blob());
        urls.current.set(file, url);
      }
      if (a.src !== url) {
        a.src = url;
        await new Promise<void>((res, rej) => { a.onloadedmetadata = () => res(); a.onerror = () => rej(new Error("Cannot load audio")); });
      }
      a.pause();
      stopAt.current = end;
      a.currentTime = start ?? 0;
      await a.play();
      setPlaying(key);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [playing]);

  return { play, playing, err };
}

type Player = ReturnType<typeof usePlayer>;

export default function DoctorPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const player = usePlayer();

  const [listError, setListError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await apiFetch<Session[]>("/api/sessions", { cache: "no-store" });
    if (r.ok && r.data) setSessions(r.data);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("session");
    let alive = true;
    const tick = () =>
      apiFetch<Session[]>("/api/sessions", { cache: "no-store" }).then((r) => {
        if (!alive) return;
        if (r.ok && r.data) { setSessions(r.data); setListError(null); }
        else setListError(r.error);
      });
    tick().then(() => { if (alive && q) setSelected(q); });
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const current = sessions.find((s) => s.id === selected) ?? null;
  const replace = (s: Session) => setSessions((all) => all.map((x) => (x.id === s.id ? s : x)));

  return (
    <main className="flex-1 flex flex-col lg:flex-row min-h-screen">
      <aside className="lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <Link href="/" className="font-semibold text-brand text-lg">Listen, Understand</Link>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">OPD waiting list</p>
            <form action="/api/logout" method="post"><button className="text-xs text-slate-400 hover:text-slate-600 underline">Log out</button></form>
          </div>
        </div>
        {listError && <p className="mx-3 mt-3 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{listError}</p>}
        <ul className="flex lg:flex-col overflow-x-auto lg:overflow-y-auto p-2 gap-1">
          {sessions.length === 0 && <li className="p-4 text-slate-400 text-sm">No patients yet.</li>}
          {sessions.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setSelected(s.id); history.replaceState(null, "", `?session=${s.id}`); }}
                className={`w-full min-w-48 text-left rounded-xl px-4 py-3 transition ${selected === s.id ? "bg-teal-50 ring-1 ring-brand" : "hover:bg-slate-50"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Token {s.token}</span>
                  {!!s.summary?.redFlags.length && <span className="text-xs font-semibold bg-red-600 text-white rounded-full px-2 py-0.5">URGENT</span>}
                </div>
                <div className="text-sm text-slate-500">{langName(s.language)}{s.age != null && ` · ${s.age} y`}</div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  <StatusPill status={s.status} />
                  {s.status !== "in_progress" && missingAnswers(s).length > 0 && <span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">{QUESTIONS.length - missingAnswers(s).length}/{QUESTIONS.length} answers</span>}
                  {s.demo && <span className="text-xs rounded-full bg-violet-100 text-violet-700 px-2 py-0.5">Demo data</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex-1 p-4 sm:p-8 overflow-y-auto">
        {current ? <SessionView key={current.id} s={current} onChange={replace} onDeleted={() => { setSelected(null); load(); }} player={player} />
          : <div className="h-full flex items-center justify-center text-slate-400">Select a patient from the list.</div>}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: Session["status"] }) {
  const c = status === "signed_off" ? "bg-emerald-100 text-emerald-800" : status === "ready" ? "bg-amber-100 text-amber-800" : status === "generating" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600";
  return <span className={`text-xs rounded-full px-2 py-0.5 ${c}`}>{STATUS_LABEL[status]}</span>;
}

function SessionView({ s, onChange, onDeleted, player }: { s: Session; onChange: (s: Session) => void; onDeleted: () => void; player: Player }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const segIndex = useMemo(() => {
    const m = new Map<string, { seg: Segment; answer: Answer }>();
    s.answers.forEach((a) => a.segments.forEach((seg) => m.set(seg.id, { seg, answer: a })));
    return m;
  }, [s.answers]);
  const factById = useMemo(() => new Map((s.summary?.facts ?? []).map((f) => [f.id, f])), [s.summary]);
  const locked = !!s.signoff;

  const [inFlight, setInFlight] = useState(false); // disables every review button while a request runs

  async function patch(body: object): Promise<boolean> {
    if (inFlight) return false;
    setInFlight(true);
    setError(null);
    const r = await apiFetch<Session>(`/api/sessions/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setInFlight(false);
    if (!r.ok || !r.data) { setError(r.error); return false; }
    onChange(r.data);
    return true;
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    const r = await apiFetch(`/api/summary/${s.id}`, { method: "POST" });
    setBusy(false);
    if (!r.ok) setError(r.error);
    const g = await apiFetch<Session>(`/api/sessions/${s.id}`);
    if (g.ok && g.data) onChange(g.data);
  }

  async function del() {
    setInFlight(true);
    const r = await apiFetch(`/api/sessions/${s.id}`, { method: "DELETE" });
    setInFlight(false);
    if (!r.ok) { setConfirmDelete(false); return setError(r.error); }
    onDeleted();
  }

  const pending = s.summary?.facts.filter((f) => f.status === "pending").length ?? 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold">Token {s.token}</h1>
            <StatusPill status={s.status} />
            {s.demo && <span className="text-sm rounded-full bg-violet-100 text-violet-700 px-3 py-0.5 font-medium">Demo data</span>}
          </div>
          <p className="text-slate-500 mt-1">
            {langName(s.language)} speaker{s.age != null && ` · ${s.age} years`} · consent recorded {s.consent.at ? new Date(s.consent.at).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {!locked && s.answers.length > 0 && !s.demo && (
            <button onClick={regenerate} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2 flex items-center gap-2 text-sm hover:bg-white">
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> {s.summary ? "Regenerate" : "Generate summary"}
            </button>
          )}
          {confirmDelete ? (
            <button onClick={del} disabled={inFlight} className="rounded-xl bg-red-600 text-white px-4 py-2 text-sm disabled:opacity-50">Confirm delete all data</button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-slate-300 px-3 py-2 text-slate-500 hover:text-red-600" title="Delete session, audio and images"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {/* red flags */}
      {s.summary?.redFlags.map((rf) => {
        const hit = segIndex.get(rf.segmentId);
        return (
          <div key={rf.segmentId} className="rounded-2xl bg-red-600 text-white p-5 flex gap-4 items-start shadow">
            <AlertTriangle className="w-8 h-8 shrink-0" />
            <div className="flex-1">
              <p className="text-xl font-semibold">Possible urgent symptom — needs immediate human assessment</p>
              <p className="mt-1 text-red-100">{rf.reason}</p>
              {hit && <p className="mt-2 text-lg">“{hit.seg.text}”</p>}
            </div>
            {hit && <PlayButton answer={hit.answer} seg={hit.seg} player={player} light />}
          </div>
        );
      })}

      {s.status !== "in_progress" && missingAnswers(s).length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            Answers recorded: {QUESTIONS.length - missingAnswers(s).length} of {QUESTIONS.length} — missing:{" "}
            {missingAnswers(s).map((n) => `Q${n}${(s.skipped ?? []).includes(n) ? " (skipped by patient)" : ""}`).join(", ")}
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-red-600 text-white shadow-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="flex-1 text-sm">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {player.err && <p className="rounded-xl bg-amber-50 text-amber-800 p-3">Playback: {player.err}</p>}

      {/* summary states */}
      {!s.summary && (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-slate-500">
          {s.summaryError ? (
            <div className="space-y-3">
              <p className="text-red-600">{s.summaryError}</p>
              <button onClick={regenerate} disabled={busy} className="rounded-xl bg-brand text-white px-5 py-2 inline-flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Retry
              </button>
            </div>
          ) : s.status === "in_progress" ? (
            <p>Interview in progress — {s.answers.length} of {QUESTIONS.length} answers received.</p>
          ) : <GeneratingNotice since={s.generatingSince ?? null} busy={busy} onRetry={regenerate} />}
        </div>
      )}

      {s.summary && (
        <>
          <div className={`rounded-xl px-4 py-2 text-sm flex items-center gap-2 ${locked ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {locked ? <BadgeCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {locked ? `Approved clinical summary — signed off by ${s.signoff!.doctorId} at ${new Date(s.signoff!.at).toLocaleString()}` : "Draft — not approved. AI-extracted; every item needs doctor review."}
            <span className="ml-auto text-xs opacity-70">
              {s.demo ? "Pre-written demo summary" : `Model: ${s.summary.model}`}
              {s.summary.dropped.facts + s.summary.dropped.prompts > 0 && ` · ${s.summary.dropped.facts} fact(s) & ${s.summary.dropped.prompts} prompt(s) dropped for missing evidence`}
            </span>
          </div>

          <div className="grid lg:grid-cols-5 gap-6">
            {/* left: facts */}
            <div className="lg:col-span-3 space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand" /> What the patient said</h2>
              <p className="text-sm text-slate-500 -mt-2">Every item is linked to the patient&apos;s own words. Press ▶ to hear the source.</p>
              {s.summary.facts.length === 0 && <p className="text-slate-400">No facts with valid evidence were extracted.</p>}
              {s.summary.facts.map((f) => (
                <FactCard key={f.id} f={f} segIndex={segIndex} player={player} locked={locked} busy={inFlight} onPatch={patch} />
              ))}
            </div>

            {/* right: prompts */}
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><MessageSquareText className="w-5 h-5 text-indigo-600" /> AI prompts</h2>
              <p className="text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-1.5 -mt-1">AI-generated prompts — for doctor verification only. Not a diagnosis or treatment advice.</p>
              {s.summary.prompts.length === 0 && <p className="text-slate-400">No prompts.</p>}
              {s.summary.prompts.map((p) => (
                <PromptCard key={p.id} p={p} factById={factById} locked={locked} busy={inFlight} onPatch={patch} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* transcripts */}
      {s.answers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Original transcripts</h2>
          {s.answers.slice().sort((a, b) => a.index - b.index).map((a) => <TranscriptBlock key={a.index} a={a} player={player} />)}
        </div>
      )}

      {/* documents */}
      {s.documents.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><FileImage className="w-5 h-5 text-brand" /> Uploaded documents</h2>
          <p className="text-sm text-slate-500">Shown as uploaded — not read by AI. Verify any medicine names yourself.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {s.documents.map((d) => (
              <a key={d.id} href={`/api/files/${d.file}`} target="_blank" className="block rounded-2xl overflow-hidden border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${d.file}`} alt={d.originalName} className="w-full max-h-96 object-contain bg-slate-50" />
                <p className="px-4 py-2 text-sm text-slate-500">{d.originalName}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* sign-off */}
      {s.summary && !locked && (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-wrap items-center gap-3">
          <BadgeCheck className="w-6 h-6 text-brand" />
          <div className="flex-1 min-w-48">
            <p className="font-semibold">Doctor sign-off</p>
            <p className="text-sm text-slate-500">{pending ? `${pending} fact(s) still pending — review each before signing.` : "All facts reviewed. Only the signed version is the clinical summary."}</p>
          </div>
          <input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} placeholder="Doctor ID" className="rounded-xl border border-slate-300 px-4 py-2" />
          <button onClick={() => patch({ action: "signoff", doctorId })} disabled={!doctorId.trim() || pending > 0 || inFlight} className="rounded-xl bg-brand text-white px-5 py-2 font-medium disabled:opacity-40">
            Sign off
          </button>
        </div>
      )}
    </div>
  );
}

function PlayButton({ answer, seg, player, light }: { answer: Answer; seg: Segment; player: Player; light?: boolean }) {
  const key = seg.id; // segments without timestamps play the whole clip
  const active = player.playing === key;
  const base = light ? "bg-white/20 hover:bg-white/30 text-white" : "bg-teal-50 hover:bg-teal-100 text-brand";
  if (!answer.audioFile) {
    return <span className={`text-xs rounded-lg px-2 py-1 ${light ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{answer.inputType === "text" && !answer.durationSec ? "typed — no audio" : "audio unavailable"}</span>;
  }
  return (
    <button onClick={() => player.play(answer.audioFile!, key, seg.start, seg.end)} className={`rounded-full w-9 h-9 shrink-0 flex items-center justify-center ${base}`} aria-label="Play evidence">
      {active ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
    </button>
  );
}

function SourceRef({ id, segIndex, player }: { id: string; segIndex: Map<string, { seg: Segment; answer: Answer }>; player: Player }) {
  const hit = segIndex.get(id);
  if (!hit) return null;
  const { seg, answer } = hit;
  const range = seg.start != null && seg.end != null ? `${fmt(seg.start)}–${fmt(seg.end)}` : answer.audioFile ? "whole clip (no timestamps)" : "";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-xs ${player.playing === seg.id ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
      <PlayButton answer={answer} seg={seg} player={player} />
      Q{answer.index} {range && `· ${range}`}
    </span>
  );
}

function FactCard({ f, segIndex, player, locked, busy, onPatch }: {
  f: Fact; segIndex: Map<string, { seg: Segment; answer: Answer }>; player: Player; locked: boolean; busy: boolean; onPatch: (b: object) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.editedText ?? f.englishText);
  const tone =
    f.status === "rejected" ? "border-slate-200 bg-slate-50 opacity-60"
      : f.status === "confirmed" || f.status === "edited" ? "border-emerald-300 bg-white"
        : "border-amber-300 bg-white";
  const bar = f.status === "rejected" ? "bg-slate-300" : f.status === "pending" ? "bg-amber-400" : "bg-emerald-500";
  const playingHere = f.sourceSegmentIds.includes(player.playing ?? "");

  return (
    <div className={`relative rounded-2xl border p-4 pl-5 shadow-sm overflow-hidden ${tone} ${playingHere ? "ring-2 ring-brand" : ""}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${bar}`} />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wide font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{f.category}</span>
            <span className="text-xs text-slate-400">{f.status}</span>
          </div>
          {editing ? (
            <div className="flex gap-2 mt-1">
              <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5" autoFocus />
              <button disabled={busy || !text.trim()} onClick={async () => { if (await onPatch({ action: "fact", factId: f.id, status: "edited", editedText: text })) setEditing(false); }} className="rounded-lg bg-brand text-white px-3 disabled:opacity-50">Save</button>
              <button onClick={() => setEditing(false)} className="rounded-lg border px-3">Cancel</button>
            </div>
          ) : f.status === "edited" && f.editedText ? (
            <p className="text-lg font-medium">{f.editedText} <span className="block text-sm font-normal text-slate-400 line-through">AI: {f.englishText}</span></p>
          ) : (
            <p className={`text-lg font-medium ${f.status === "rejected" ? "line-through" : ""}`}>{f.englishText}</p>
          )}
          <p className="text-slate-500 mt-1">
            {f.originalText}
            {!f.originalTextVerbatim && <span className="ml-2 text-xs text-amber-700">(full source segment shown)</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {f.sourceSegmentIds.map((id) => <SourceRef key={id} id={id} segIndex={segIndex} player={player} />)}
          </div>
        </div>
        {!locked && (
          <div className="flex flex-col gap-1">
            <IconBtn disabled={busy} title="Confirm" active={f.status === "confirmed"} onClick={() => onPatch({ action: "fact", factId: f.id, status: "confirmed" })} className="text-emerald-700 hover:bg-emerald-50"><Check className="w-4 h-4" /></IconBtn>
            <IconBtn disabled={busy} title="Edit" active={f.status === "edited"} onClick={() => setEditing(true)} className="text-slate-600 hover:bg-slate-100"><Pencil className="w-4 h-4" /></IconBtn>
            <IconBtn disabled={busy} title="Reject" active={f.status === "rejected"} onClick={() => onPatch({ action: "fact", factId: f.id, status: "rejected" })} className="text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></IconBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, active, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button {...p} className={`w-9 h-9 rounded-lg border flex items-center justify-center disabled:opacity-40 disabled:cursor-wait ${active ? "border-current bg-slate-50" : "border-slate-200"} ${className}`}>{children}</button>;
}

function PromptCard({ p, factById, locked, busy, onPatch }: { p: DoctorPrompt; factById: Map<string, Fact>; locked: boolean; busy: boolean; onPatch: (b: object) => Promise<boolean> }) {
  const dim = p.status === "dismissed" ? "opacity-50" : "";
  return (
    <div className={`rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm ${dim}`}>
      <p className={`${p.status === "dismissed" ? "line-through" : ""}`}>{p.text}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {p.supportingFactIds.map((id) => (
          <span key={id} className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">Based on: {factById.get(id)?.englishText ?? id}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        {p.status !== "pending" && <span className={`rounded-full px-2 py-0.5 ${p.status === "asked" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{p.status === "asked" ? "Asked" : "Dismissed"}</span>}
        {!locked && (
          <>
            <button disabled={busy} onClick={() => onPatch({ action: "prompt", promptId: p.id, status: "asked" })} className="ml-auto rounded-lg border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">Mark asked</button>
            <button disabled={busy} onClick={() => onPatch({ action: "prompt", promptId: p.id, status: "dismissed" })} className="rounded-lg border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">Dismiss</button>
          </>
        )}
      </div>
    </div>
  );
}

function TranscriptBlock({ a, player }: { a: Answer; player: Player }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl bg-white border border-slate-200">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold text-brand">Q{a.index}</span>
        <span className="flex-1 text-slate-700">{QUESTIONS[a.index - 1]?.en}</span>
        <span className="text-xs text-slate-400">{a.inputType === "text" && !a.audioFile ? "typed" : a.durationSec != null ? `${a.durationSec.toFixed(1)} s` : ""}{a.audioFile && !a.timestampsAvailable && " · no timestamps"}</span>
        <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {a.segments.map((seg) => (
            <div key={seg.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${player.playing === seg.id ? "bg-teal-100" : "bg-slate-50"}`}>
              <PlayButton answer={a} seg={seg} player={player} />
              <span className="flex-1 text-lg">{seg.text}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{seg.start != null && seg.end != null ? `${fmt(seg.start)}–${fmt(seg.end)}` : ""} · {seg.id}</span>
            </div>
          ))}
          {a.englishTranslation && <p className="text-sm text-slate-500 px-3"><span className="font-medium">Machine translation:</span> {a.englishTranslation}</p>}
        </div>
      )}
    </div>
  );
}

function GeneratingNotice({ since, busy, onRetry }: { since: string | null; busy: boolean; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const stuck = !since || now - new Date(since).getTime() > STUCK_AFTER_MS;
  if (!stuck) return <p className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Generating summary…</p>;
  return (
    <div className="space-y-3">
      <p className="text-amber-700">Summary seems stuck — it has not finished after 3 minutes.</p>
      <button onClick={onRetry} disabled={busy} className="rounded-xl bg-brand text-white px-5 py-2 inline-flex items-center gap-2 disabled:opacity-50">
        <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Retry
      </button>
    </div>
  );
}
