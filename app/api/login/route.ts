import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_TTL_SECONDS, authConfig, checkPasscode, createToken } from "@/lib/auth";

export async function POST(req: Request) {
  const cfg = authConfig();
  if ("open" in cfg) return NextResponse.json({ ok: true, open: true });
  if ("error" in cfg) return NextResponse.json({ error: cfg.error }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!passcode || !(await checkPasscode(passcode, cfg.passcode, cfg.secret))) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await createToken(cfg.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_TTL_SECONDS,
  });
  return res;
}
