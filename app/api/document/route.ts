import { NextResponse } from "next/server";
import { getSession, newId, saveFile, updateSession } from "@/lib/store";

const MAX = 4 * 1024 * 1024; // Vercel request bodies are capped at 4.5 MB

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const sessionId = String(form?.get("sessionId") ?? "");
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!(await getSession(sessionId))) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (file.size > MAX) return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  // Check magic bytes, not just the declared type.
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : buf.toString("hex", 0, 4) === "89504e47" ? "png" : null;
  if (!ext) return NextResponse.json({ error: "Only JPG or PNG images are accepted" }, { status: 415 });
  const name = await saveFile(ext, buf);
  const s = await updateSession(sessionId, (s) => {
    s.documents.push({ id: newId(), file: name, originalName: file.name.slice(0, 100), uploadedAt: new Date().toISOString() });
  });
  return NextResponse.json(s);
}
