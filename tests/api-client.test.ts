import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";

const mockFetch = (res: Response | Error) =>
  vi.stubGlobal("fetch", vi.fn(async () => { if (res instanceof Error) throw res; return res; }));

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("turns an empty 500 body into a plain message", async () => {
    mockFetch(new Response("", { status: 500 }));
    expect(await apiFetch("/x")).toEqual({ ok: false, status: 500, data: null, error: "The server is busy, please try again." });
  });

  it("handles Vercel's plain-text 413", async () => {
    mockFetch(new Response("Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE", { status: 413, headers: { "content-type": "text/plain" } }));
    const r = await apiFetch("/x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("File too large.");
  });

  it("prefers the server's JSON error message", async () => {
    mockFetch(new Response(JSON.stringify({ error: "Token number is required" }), { status: 400 }));
    expect((await apiFetch("/x")).error).toBe("Token number is required");
  });

  it("returns parsed JSON on success", async () => {
    mockFetch(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    expect(await apiFetch<{ id: string }>("/x")).toEqual({ ok: true, status: 200, data: { id: "abc" }, error: null });
  });

  it("reports network failures without throwing", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    const r = await apiFetch("/x");
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/Network problem/);
  });
});
