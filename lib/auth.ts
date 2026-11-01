// Shared-passcode gate (hackathon level). Web Crypto only, so it runs in proxy.ts and route handlers.
export const AUTH_COOKIE = "lu_auth";
export const AUTH_TTL_SECONDS = 12 * 60 * 60;

const enc = new TextEncoder();

async function hmac(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type AuthConfig = { passcode: string; secret: string } | { error: string } | { open: true };

/** In production a missing passcode/secret blocks everything; in local dev the app stays open. */
export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const passcode = env.APP_PASSCODE;
  const secret = env.SESSION_SECRET;
  if (!passcode) return env.NODE_ENV === "production" ? { error: "APP_PASSCODE is not configured" } : { open: true };
  if (!secret || secret.length < 32) return { error: "SESSION_SECRET is not configured (needs 32+ characters)" };
  return { passcode, secret };
}

export async function checkPasscode(input: string, passcode: string, secret: string): Promise<boolean> {
  // Compare HMACs so the comparison is constant-time and length-independent.
  return safeEqual(await hmac(secret, `pc:${input}`), await hmac(secret, `pc:${passcode}`));
}

export async function createToken(secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + AUTH_TTL_SECONDS;
  return `${exp}.${await hmac(secret, `auth:${exp}`)}`;
}

export async function verifyToken(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp < now / 1000) return false;
  return safeEqual(sig, await hmac(secret, `auth:${exp}`));
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });

/** Defence in depth for API routes: returns a 401/503 Response when not authorised, otherwise null. */
export async function requireAuth(req: Request, env: Record<string, string | undefined> = process.env): Promise<Response | null> {
  const cfg = authConfig(env);
  if ("open" in cfg) return null;
  if ("error" in cfg) return json(503, cfg.error);
  const ok = await verifyToken(readCookie(req.headers.get("cookie"), AUTH_COOKIE), cfg.secret);
  return ok ? null : json(401, "Please log in again");
}
