import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import type { Session } from "./types";

/**
 * Storage for sessions (JSON) and files (audio / images).
 * - Local dev: data/sessions.json + data/files/ (outside public/).
 * - On Vercel: a PRIVATE Vercel Blob store (sessions/<id>.json, files/<name>), because the
 *   serverless filesystem is read-only and not shared between instances. Files are only ever
 *   served through /api/files, never by a public URL.
 */
const USE_BLOB = !!process.env.VERCEL || process.env.STORAGE === "blob";

export const newId = () => crypto.randomBytes(8).toString("hex");
const SAFE_NAME = /^[a-zA-Z0-9_-]+\.(wav|jpg|jpeg|png)$/;
const CONTENT_TYPES: Record<string, string> = { wav: "audio/wav", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

interface Backend {
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

/* ------------------------------ local filesystem ------------------------------ */
function localBackend(): Backend {
  const DATA_DIR = path.join(process.cwd(), "data");
  const FILES_DIR = path.join(DATA_DIR, "files");
  const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
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
    await fs.mkdir(DATA_DIR, { recursive: true });
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
function blobBackend(): Backend {
  const key = (id: string) => `sessions/${id}.json`;
  const safeId = (id: string) => /^[a-f0-9]{16}$/.test(id);

  async function readJson(pathname: string): Promise<{ s: Session } | null> {
    const r = await get(pathname, { access: "private", useCache: false }); // always read the latest version
    if (!r || r.statusCode !== 200) return null;
    return { s: JSON.parse(await new Response(r.stream).text()) as Session };
  }
  const writeJson = (s: Session, overwrite = false) =>
    put(key(s.id), JSON.stringify(s), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: overwrite,
    });

  return {
    listSessions: async () => {
      const out: Session[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: "sessions/", cursor });
        const got = await Promise.all(page.blobs.map((b) => readJson(b.pathname).catch(() => null)));
        got.forEach((g) => g && out.push(g.s));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },
    getSession: async (id) => (safeId(id) ? (await readJson(key(id)))?.s ?? null : null),
    createSession: async (s) => { await writeJson(s); return s; },
    // Last-writer-wins. Writes to one session are sequential in practice (one patient, one doctor).
    // TODO: optimistic locking via ifMatch — ETag preconditions failed on every write in testing.
    updateSession: async (id, fn) => {
      if (!safeId(id)) return null;
      const cur = await readJson(key(id));
      if (!cur) return null;
      fn(cur.s);
      await writeJson(cur.s, true);
      return cur.s;
    },
    deleteSession: async (id) => {
      if (!safeId(id)) return false;
      const cur = await readJson(key(id));
      if (!cur) return false;
      await del([...sessionFiles(cur.s).map((f) => `files/${f}`), key(id)]);
      return true;
    },
    saveFile: async (ext, data) => {
      const name = `${newId()}.${ext}`;
      await put(`files/${name}`, data, { access: "private", contentType: CONTENT_TYPES[ext], addRandomSuffix: false });
      return name;
    },
    readFile: async (name) => {
      if (!SAFE_NAME.test(name)) return null;
      const r = await get(`files/${name}`, { access: "private", useCache: false }); // deleted files must not linger in cache
      if (!r || r.statusCode !== 200) return null;
      return Buffer.from(await new Response(r.stream).arrayBuffer());
    },
  };
}

const backend: Backend = USE_BLOB ? blobBackend() : localBackend();

export const listSessions = () => backend.listSessions();
export const getSession = (id: string) => backend.getSession(id);
export const createSession = (s: Session) => backend.createSession(s);
/** Apply a mutation to one session. `fn` may run more than once (on a concurrent-write retry). */
export const updateSession = (id: string, fn: (s: Session) => void) => backend.updateSession(id, fn);
export const deleteSession = (id: string) => backend.deleteSession(id);
export const saveFile = (ext: string, data: Buffer) => backend.saveFile(ext, data);
export const readFile = (name: string) => backend.readFile(name);
