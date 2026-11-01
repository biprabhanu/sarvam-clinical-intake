// Server-side helpers to concatenate PCM WAV buffers (used only for generating demo audio).
interface Pcm { sampleRate: number; channels: number; bits: number; data: Buffer }

export function parseWav(buf: Buffer): Pcm {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let off = 12;
  let fmt: Omit<Pcm, "data"> | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data before fmt");
      if (size === 0xffffffff || body + size > buf.length) size = buf.length - body; // streaming-style header
      return { ...fmt, data: buf.subarray(body, body + size) };
    }
    off = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function buildWav(p: Pcm): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + p.data.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(p.channels, 22);
  h.writeUInt32LE(p.sampleRate, 24);
  h.writeUInt32LE((p.sampleRate * p.channels * p.bits) / 8, 28);
  h.writeUInt16LE((p.channels * p.bits) / 8, 32);
  h.writeUInt16LE(p.bits, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(p.data.length, 40);
  return Buffer.concat([h, p.data]);
}

/** Concatenate WAVs with a gap of silence; returns the WAV plus measured [start,end] per part. */
export function concatWavs(parts: Buffer[], gapSec = 0.35) {
  const pcms = parts.map(parseWav);
  const f = pcms[0];
  const bytesPerSec = (f.sampleRate * f.channels * f.bits) / 8;
  const align = (f.channels * f.bits) / 8;
  const gapBytes = Math.round((gapSec * bytesPerSec) / align) * align;
  const chunks: Buffer[] = [];
  const times: { start: number; end: number }[] = [];
  let pos = 0;
  pcms.forEach((p, i) => {
    if (p.sampleRate !== f.sampleRate || p.channels !== f.channels || p.bits !== f.bits) throw new Error("WAV format mismatch");
    if (i > 0) { chunks.push(Buffer.alloc(gapBytes)); pos += gapBytes; }
    times.push({ start: +(pos / bytesPerSec).toFixed(2), end: +((pos + p.data.length) / bytesPerSec).toFixed(2) });
    chunks.push(p.data);
    pos += p.data.length;
  });
  return { wav: buildWav({ ...f, data: Buffer.concat(chunks) }), times, duration: +(pos / bytesPerSec).toFixed(2) };
}
