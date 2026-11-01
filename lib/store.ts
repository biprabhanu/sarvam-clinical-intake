import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Session } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const FILES_DIR = path.join(DATA_DIR, "files");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

let queue: Promise<unknown> = Promise.resolve();
/** Serialise all read-modify-write operations on the JSON file. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<Session[]> {
  try {
    return JSON.parse(await fs.readFile(SESSIONS_FILE, "utf8")) as Session[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function writeAll(sessions: Session[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = SESSIONS_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(sessions, null, 2));
  await fs.rename(tmp, SESSIONS_FILE);
}

export const listSessions = () => locked(readAll);

export const getSession = (id: string) =>
  locked(async () => (await readAll()).find((s) => s.id === id) ?? null);

export const createSession = (s: Session) =>
  locked(async () => {
    const all = await readAll();
    all.push(s);
    await writeAll(all);
    return s;
  });

/** Apply a mutation to one session atomically. Returns the updated session or null if not found. */
export const updateSession = (id: string, fn: (s: Session) => void) =>
  locked(async () => {
    const all = await readAll();
    const s = all.find((x) => x.id === id);
    if (!s) return null;
    fn(s);
    await writeAll(all);
    return s;
  });

export const deleteSession = (id: string) =>
  locked(async () => {
    const all = await readAll();
    const s = all.find((x) => x.id === id);
    if (!s) return false;
    const files = [
      ...s.answers.map((a) => a.audioFile),
      ...s.documents.map((d) => d.file),
    ].filter((f): f is string => !!f);
    await Promise.all(files.map((f) => fs.rm(path.join(FILES_DIR, f), { force: true })));
    await writeAll(all.filter((x) => x.id !== id));
    return true;
  });

export const newId = () => crypto.randomBytes(8).toString("hex");

const SAFE_NAME = /^[a-zA-Z0-9_-]+\.(wav|jpg|jpeg|png)$/;

export async function saveFile(ext: string, data: Buffer): Promise<string> {
  await fs.mkdir(FILES_DIR, { recursive: true });
  const name = `${newId()}.${ext}`;
  await fs.writeFile(path.join(FILES_DIR, name), data);
  return name;
}

export async function readFile(name: string): Promise<Buffer | null> {
  if (!SAFE_NAME.test(name)) return null;
  try {
    return await fs.readFile(path.join(FILES_DIR, name));
  } catch {
    return null;
  }
}
