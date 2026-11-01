import { describe, expect, it, vi } from "vitest";
import { ConflictError, createBlobBackend, MAX_UPDATE_ATTEMPTS, type BlobClient } from "@/lib/store";
import { route } from "@/lib/route";
import type { Session } from "@/lib/types";

class PreconditionFailed extends Error {}

/** In-memory fake of the Blob client with real ETag semantics. */
function fakeBlob(opts: { conflicts?: number } = {}) {
  const store = new Map<string, { body: string; etag: string }>();
  let version = 0;
  let conflictsLeft = opts.conflicts ?? 0;
  const putCalls: { ifMatch?: string; allowOverwrite?: boolean }[] = [];
  const client = {
    get: vi.fn(async (pathname: string) => {
      const e = store.get(pathname);
      if (!e) return null;
      return { statusCode: 200, stream: new Response(e.body).body, headers: new Headers(), blob: { etag: e.etag } };
    }),
    put: vi.fn(async (pathname: string, body: string, o: { ifMatch?: string; allowOverwrite?: boolean }) => {
      putCalls.push({ ifMatch: o.ifMatch, allowOverwrite: o.allowOverwrite });
      const cur = store.get(pathname);
      if (o.ifMatch !== undefined) {
        if (conflictsLeft > 0) {
          conflictsLeft--;
          // Another instance wrote in between: bump the stored version so the next read sees a new ETag.
          if (cur) store.set(pathname, { body: cur.body, etag: `"v${++version}"` });
          throw new PreconditionFailed("ETag mismatch");
        }
        if (!cur || cur.etag !== o.ifMatch) throw new PreconditionFailed("ETag mismatch");
      } else if (cur && !o.allowOverwrite) throw new Error("exists");
      store.set(pathname, { body: String(body), etag: `"v${++version}"` });
      return { pathname };
    }),
    list: vi.fn(async () => ({ blobs: [...store.keys()].map((pathname) => ({ pathname })), hasMore: false })),
    del: vi.fn(async (p: string[] | string) => { (Array.isArray(p) ? p : [p]).forEach((k) => store.delete(k)); }),
    isPreconditionFailed: (e: unknown) => e instanceof PreconditionFailed,
  } as unknown as BlobClient;
  return { client, store, putCalls };
}

const session = (): Session => ({
  id: "0123456789abcdef", token: "1", age: 30, language: "hi-IN", consent: { given: true, at: "t" }, status: "in_progress",
  demo: false, createdAt: "t", answers: [], documents: [], summary: null, summaryError: null, signoff: null,
});

describe("blob store", () => {
  it("writes updates with ifMatch + allowOverwrite", async () => {
    const { client, putCalls } = fakeBlob();
    const b = createBlobBackend(client);
    await b.createSession(session());
    const s = await b.updateSession("0123456789abcdef", (x) => { x.token = "2"; });
    expect(s?.token).toBe("2");
    expect(putCalls.at(-1)).toEqual({ ifMatch: '"v1"', allowOverwrite: true });
    expect((await b.getSession("0123456789abcdef"))?.token).toBe("2");
  });

  it("retries after an ETag conflict and keeps the other writer's data", async () => {
    const { client } = fakeBlob({ conflicts: 2 });
    const b = createBlobBackend(client);
    await b.createSession(session());
    const fn = vi.fn((x: Session) => { x.token = "retry-ok"; });
    const s = await b.updateSession("0123456789abcdef", fn);
    expect(s?.token).toBe("retry-ok");
    expect(fn).toHaveBeenCalledTimes(3); // re-read + re-applied after each conflict
  });

  it(`gives up after ${MAX_UPDATE_ATTEMPTS} conflicts with a ConflictError that maps to HTTP 409`, async () => {
    const { client } = fakeBlob({ conflicts: MAX_UPDATE_ATTEMPTS });
    const b = createBlobBackend(client);
    await b.createSession(session());
    await expect(b.updateSession("0123456789abcdef", () => undefined)).rejects.toBeInstanceOf(ConflictError);

    const { client: c2 } = fakeBlob({ conflicts: 99 });
    const b2 = createBlobBackend(c2);
    await b2.createSession(session());
    const res = await route("test", async () => { await b2.updateSession("0123456789abcdef", () => undefined); return new Response("ok"); })(new Request("http://x"), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/try again/);
  });

  it("deletes the session JSON and all its files", async () => {
    const { client, store } = fakeBlob();
    const b = createBlobBackend(client);
    const name = await b.saveFile("wav", Buffer.from("RIFF"));
    const s = session();
    s.answers.push({ index: 1, inputType: "voice", audioFile: name, durationSec: 1, transcript: "x", englishTranslation: null, languageCode: "hi-IN", timestampsAvailable: false, segments: [], createdAt: "t" });
    await b.createSession(s);
    expect(await b.readFile(name)).not.toBeNull();
    expect(await b.deleteSession(s.id)).toBe(true);
    expect(store.size).toBe(0);
    expect(await b.readFile(name)).toBeNull();
  });

  it("rejects unsafe file names and session ids", async () => {
    const { client } = fakeBlob();
    const b = createBlobBackend(client);
    expect(await b.readFile("../secret.wav")).toBeNull();
    expect(await b.getSession("../../x")).toBeNull();
  });
});
