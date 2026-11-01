// Browser-side: shrink a phone photo so it stays well under Vercel's 4.5 MB request limit.
export const MAX_SIDE = 1600;

export async function downscaleImage(file: File, maxSide = MAX_SIDE, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); // respects EXIF rotation
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#fff"; // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", quality),
  );
}
