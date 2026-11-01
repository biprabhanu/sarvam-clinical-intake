"use client";
import { useState } from "react";
import { Ear, Loader2, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Login failed");
      const next = new URLSearchParams(location.search).get("next");
      location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand text-white flex items-center justify-center"><Ear className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-semibold">Listen, Understand</h1>
            <p className="text-sm text-slate-500">Enter the team passcode</p>
          </div>
        </div>
        <label className="block">
          <span className="text-slate-600 text-sm">Passcode</span>
          <input type="password" autoFocus value={passcode} onChange={(e) => setPasscode(e.target.value)} className="mt-1 w-full text-lg rounded-xl border border-slate-300 px-4 py-3" />
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={!passcode || busy} className="w-full rounded-xl bg-brand text-white py-3 text-lg font-medium flex items-center justify-center gap-2 disabled:opacity-40">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LockKeyhole className="w-5 h-5" />} Log in
        </button>
      </form>
    </main>
  );
}
