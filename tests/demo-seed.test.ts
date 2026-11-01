import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";

const sessions: Session[] = [];
const tts = vi.fn();

vi.mock("@/lib/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
  return {
    ...actual,
    listSessions: async () => structuredClone(sessions),
    createSession: async (s: Session) => { sessions.push(structuredClone(s)); return s; },
    updateSession: async (id: string, fn: (s: Session) => void) => { const s = sessions.find((x) => x.id === id); if (!s) return null; fn(s); return s; },
    saveFile: async () => "deadbeefdeadbeef.wav",
  };
});
vi.mock("@/lib/sarvam", () => ({ tts: (...a: unknown[]) => tts(...a) }));

describe("demo seed", () => {
  beforeEach(() => { sessions.length = 0; tts.mockReset(); });

  it("creates a demo session once, then resets it instead of duplicating it", async () => {
    tts.mockRejectedValue(new Error("offline")); // first seed: no network → stored without audio
    const { POST } = await import("@/app/api/demo/seed/route");
    const first = await (await POST(new Request("http://x/api/demo/seed", { method: "POST" }), {})).json();
    expect(sessions.filter((s) => s.demo)).toHaveLength(1);
    expect(first.reused).toBe(false);

    // Doctor reviews and signs off the demo...
    const d = sessions[0];
    d.summary!.facts.forEach((f) => (f.status = "confirmed"));
    d.signoff = { doctorId: "DR-1", at: "t" };
    d.status = "signed_off";
    tts.mockClear();

    const second = await (await POST(new Request("http://x/api/demo/seed", { method: "POST" }), {})).json();
    expect(second).toMatchObject({ id: first.id, reused: true });
    expect(sessions.filter((s) => s.demo)).toHaveLength(1);
    expect(tts).not.toHaveBeenCalled(); // no paid audio generation on reset
    expect(sessions[0].signoff).toBeNull();
    expect(sessions[0].status).toBe("ready");
    expect(sessions[0].summary!.facts.every((f) => f.status === "pending")).toBe(true);
  });
});
