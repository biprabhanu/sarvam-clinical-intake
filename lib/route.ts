import { NextResponse } from "next/server";
import { requireAuth } from "./auth";
import { ConflictError } from "./store";

/**
 * Wrap an API route handler: auth check (defence in depth behind proxy.ts), and any unexpected
 * error becomes JSON { error } (409 for session write conflicts, otherwise 500) and is logged.
 */
export function route<C>(name: string, fn: (req: Request, ctx: C) => Promise<Response>, opts: { auth?: boolean } = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (opts.auth !== false) {
        const denied = await requireAuth(req);
        if (denied) return denied;
      }
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
      console.error(`[api ${name}]`, e);
      return NextResponse.json({ error: "Something went wrong on the server — please try again." }, { status: 500 });
    }
  };
}
