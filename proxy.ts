import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authConfig, verifyToken } from "@/lib/auth";

// Runs before every page and API route except the ones excluded by the matcher below.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const cfg = authConfig();
  if ("open" in cfg) return NextResponse.next(); // local dev without a passcode

  if ("error" in cfg) {
    return isApi
      ? NextResponse.json({ error: cfg.error }, { status: 503 })
      : new NextResponse(`${cfg.error}. Set it in Vercel → Project → Settings → Environment Variables.`, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (await verifyToken(request.cookies.get(AUTH_COOKIE)?.value, cfg.secret)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const url = new URL("/login", request.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
