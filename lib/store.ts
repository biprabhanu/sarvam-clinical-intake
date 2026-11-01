import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as vercelBlob from "@vercel/blob";
import type { Session } from "./types";

/**
 * Storage for sessions (JSON) and files (audio / images).
 * - With a Blob store configured (BLOB_READ_WRITE_TOKEN): a PRIVATE Vercel Blob store —
 *   sessions/<id>.json and files/<name>. Files are only served through /api/files.
 * - Local dev without a token: data/sessions.json + data/files/ (outside public/).
 * - On Vercel without a Blob store: every call fails loudly (never falls back to the disk).
 */

export const newId = () => crypto.randomBytes(8).toString("hex");
export const SAFE_NAME = /^[a-zA-Z0-9_-]+\.(wav|jpg|jpeg|png)$/;
const CONTENT_TYPES: Record<string, string> = { wav: "audio/wav", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

/** Thrown when a session keeps changing underneath us; routes map it to HTTP 409. */
export class ConflictError extends Error {
  status = 409;
  constructor() {
    super("This session was changed by someone else at the same moment — please try again.");
  }
}

export interface Backend {
  listSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(s: Session): Promise<Session>;
  updateSession(id: string, fn: (s: Session) => void): Promise<Session | null>;
  deleteSession(id: string): Promise<boolean>;
  saveFile(ext: string, data: Buffer): Promise<string>;
  readFile(name: string): Promise<Buffer | null>;
}

const sessionFiles = (s: Session) =>
  [...s.answers.map((a) => a.audioFile), ...s.documents.map((d) => d.file)].filter((f): f is string => !!f);

/* ------------------------------ local filesystem (dev only) ------------------------------ */
export function createLocalBackend(root = path.join(process.cwd(), "data")): Backend {
  const FILES_DIR = path.join(root, "files");
  const SESSIONS_FILE = path.join(root, "sessions.json");
  // Single-process dev server, so an in-process queue is enough here.
  let queue: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  const readAll = async (): Promise<Session[]> => {
    try {
      return JSON.parse(await fs.readFile(SESSIONS_FILE, "utf8")) as Session[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  };
  const writeAll = async (sessions: Session[]) => {
    await fs.mkdir(root, { recursive: true });
    const tmp = SESSIONS_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(sessions, null, 2));
    await fs.rename(tmp, SESSIONS_FILE);
  };
  return {
    listSessions: () => locked(readAll),
    getSession: (id) => locked(async () => (await readAll()).find((s) => s.id === id) ?? null),
    createSession: (s) => locked(async () => { const all = await readAll(); all.push(s); await writeAll(all); return s; }),
    updateSession: (id, fn) =>
      locked(async () => {
        const all = await readAll();
        const s = all.find((x) => x.id === id);
        if (!s) return null;
        fn(s);
        await writeAll(all);
        return s;
      }),
    deleteSession: (id) =>
      locked(async () => {
        const all = await readAll();
        const s = all.find((x) => x.id === id);
        if (!s) return false;
        await Promise.all(sessionFiles(s).map((f) => fs.rm(path.join(FILES_DIR, f), { force: true })));
        await writeAll(all.filter((x) => x.id !== id));
        return true;
      }),
    saveFile: async (ext, data) => {
      await fs.mkdir(FILES_DIR, { recursive: true });
      const name = `${newId()}.${ext}`;
      await fs.writeFile(path.join(FILES_DIR, name), data);
      return name;
    },
    readFile: async (name) => {
      if (!SAFE_NAME.test(name)) return null;
      try {
        return await fs.readFile(path.join(FILES_DIR, name));
      } catch {
        return null;
      }
    },
  };
}

/* ------------------------------ private Vercel Blob ------------------------------ */
/** The subset of @vercel/blob we use — injectable so tests can mock it. */
export interface BlobClient {
  get: typeof vercelBlob.get;
  put: typeof vercelBlob.put;
  list: typeof vercelBlob.list;
  del: typeof vercelBlob.del;
  isPreconditionFailed: (e: unknown) => boolean;
}

const realBlobClient: BlobClient = {
  get: vercelBlob.get,
  put: vercelBlob.put,
  list: vercelBlob.list,
  del: vercelBlob.del,
  isPreconditionFailed: isBlobWriteConflict,
};

/**
 * Both mean "someone else wrote this blob concurrently — re-read and retry":
 * - BlobPreconditionFailedError: our ifMatch ETag is stale.
 * - BlobError "conditional request cannot succeed due to a conflicting operation": two conditional
 *   writes hit the same blob at the same instant (seen live with parallel answers).
 */
export function isBlobWriteConflict(e: unknown): boolean {
  if (e instanceof vercelBlob.BlobPreconditionFailedError) return true;
  return e instanceof vercelBlob.BlobError && /conflicting operation/i.test(e.message);
}

export const MAX_UPDATE_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let retryDelayMs = (attempt: number) => Math.round(Math.random() * 150 * attempt);
/** Test hook: disable backoff delays. */
export const setRetryDelayForTests = (fn: (attempt: number) => number) => { retryDelayMs = fn; };

export function createBlobBackend(client: BlobClient = realBlobClient): Backend {
  const key = (id: string) => `sessions/${id}.json`;
  const safeId = (id: string) => /^[a-f0-9]{16}$/.test(id);
  const normEtag = (e: string) => e.replace(/^W\//, ""); // weak → strong form

  async function readJson(pathname: string): Promise<{ s: Session; etag: string } | null> {
    const r = await client.get(pathname, { access: "private", useCache: false }); // always the latest version
    if (!r || r.statusCode !== 200) return null;
    return { s: JSON.parse(await new Response(r.stream).text()) as Session, etag: normEtag(r.blob.etag) };
  }
  const putJson = (s: Session, opts: { ifMatch?: string; allowOverwrite: boolean }) =>
    client.put(key(s.id), JSON.stringify(s), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      ...opts,
    });

  return {
    listSessions: async () => {
      const out: Session[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.list({ prefix: "sessions/", cursor });
        const got = await Promise.all(page.blobs.map((b) => readJson(b.pathname).catch(() => null)));
        got.forEach((g) => g && out.push(g.s));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },
    getSession: async (id) => (safeId(id) ? (await readJson(key(id)))?.s ?? null : null),
    createSession: async (s) => {
      await putJson(s, { allowOverwrite: false });
      return s;
    },
    // Optimistic concurrency across instances: write only if the ETag is unchanged since our read.
    updateSession: async (id, fn) => {
      if (!safeId(id)) return null;
      for (let attempt = 1; attempt <= MAX_UPDATE_ATTEMPTS; attempt++) {
        const cur = await readJson(key(id));
        if (!cur) return null;
        fn(cur.s);
        try {
          await putJson(cur.s, { ifMatch: cur.etag, allowOverwrite: true });
          return cur.s;
        } catch (e) {
          if (!client.isPreconditionFailed(e)) throw e;
          console.warn(`[store] write conflict on session ${id} (attempt ${attempt}/${MAX_UPDATE_ATTEMPTS})`);
          if (attempt < MAX_UPDATE_ATTEMPTS) await sleep(retryDelayMs(attempt)); // jitter so racing writers spread out
        }
      }
      throw new ConflictError();
    },
    deleteSession: async (id) => {
      if (!safeId(id)) return false;
      const cur = await readJson(key(id));
      if (!cur) return false;
      await client.del([...sessionFiles(cur.s).map((f) => `files/${f}`), key(id)]);
      return true;
    },
    saveFile: async (ext, data) => {
      const name = `${newId()}.${ext}`;
      await client.put(`files/${name}`, data, { access: "private", contentType: CONTENT_TYPES[ext], addRandomSuffix: false });
      return name;
    },
    readFile: async (name) => {
      if (!SAFE_NAME.test(name)) return null;
      // useCache:false so a deleted file is never served from the CDN cache.
      const r = await client.get(`files/${name}`, { access: "private", useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return Buffer.from(await new Response(r.stream).arrayBuffer());
    },
  };
}

/* ------------------------------ selection ------------------------------ */
function misconfiguredBackend(): Backend {
  const fail = async (): Promise<never> => {
    throw new Error("Storage is not configured: connect a private Vercel Blob store to this project (BLOB_READ_WRITE_TOKEN is missing).");
  };
  return { listSessions: fail, getSession: fail, createSession: fail, updateSession: fail, deleteSession: fail, saveFile: fail, readFile: fail };
}

let backend: Backend | null = null;
function b(): Backend {
  if (!backend) {
    if (process.env.BLOB_READ_WRITE_TOKEN) backend = createBlobBackend();
    else if (process.env.VERCEL) backend = misconfiguredBackend(); // never use the disk on Vercel
    else backend = createLocalBackend();
  }
  return backend;
}

export const listSessions = () => b().listSessions();
export const getSession = (id: string) => b().getSession(id);
export const createSession = (s: Session) => b().createSession(s);
/** Apply a mutation to one session. `fn` may run more than once (on an ETag-conflict retry). */
export const updateSession = (id: string, fn: (s: Session) => void) => b().updateSession(id, fn);
export const deleteSession = (id: string) => b().deleteSession(id);
export const saveFile = (ext: string, data: Buffer) => b().saveFile(ext, data);
export const readFile = (name: string) => b().readFile(name);
