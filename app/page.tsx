"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ear, Loader2, Mic, Stethoscope, Sparkles } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/demo/seed", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      router.push(`/doctor?session=${j.id}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand text-white mb-6">
          <Ear className="w-8 h-8" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">Listen, Understand</h1>
        <p className="mt-4 text-xl text-slate-600">
          Speak in the language you&apos;re comfortable with. We&apos;ll help your doctor understand.
        </p>
        <p className="mt-2 text-slate-500">Odia · Hindi · Marathi — OPD intake with evidence-linked summaries</p>

        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          <Link href="/patient" className="rounded-2xl bg-brand hover:bg-brand-dark text-white p-6 flex flex-col items-center gap-3 shadow-sm transition">
            <Mic className="w-8 h-8" />
            <span className="text-xl font-semibold">Patient kiosk</span>
            <span className="text-teal-100 text-sm">Answer a few questions by voice</span>
          </Link>
          <Link href="/doctor" className="rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 p-6 flex flex-col items-center gap-3 shadow-sm transition">
            <Stethoscope className="w-8 h-8 text-brand" />
            <span className="text-xl font-semibold">Doctor dashboard</span>
            <span className="text-slate-500 text-sm">Review, verify and sign off</span>
          </Link>
        </div>

        <button onClick={seed} disabled={loading} className="mt-6 inline-flex items-center gap-2 text-brand font-medium hover:underline disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "Generating demo session (Odia audio)…" : "Load demo session"}
        </button>
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}

        <p className="mt-12 text-xs text-slate-400">
          Hackathon prototype. Not a medical device. AI never diagnoses or prescribes — the doctor reviews and signs off. Use synthetic data only.
        </p>
      </div>
    </main>
  );
}
