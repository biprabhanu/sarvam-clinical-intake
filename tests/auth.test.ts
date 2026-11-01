import { describe, expect, it } from "vitest";
import { authConfig, AUTH_COOKIE, checkPasscode, createToken, requireAuth, verifyToken } from "@/lib/auth";

const SECRET = "s".repeat(40);
const env = { NODE_ENV: "production", APP_PASSCODE: "open-sesame", SESSION_SECRET: SECRET };
const req = (cookie?: string) => new Request("https://app/api/sessions", { headers: cookie ? { cookie } : {} });

describe("auth", () => {
  it("rejects a wrong passcode and accepts the right one", async () => {
    expect(await checkPasscode("nope", "open-sesame", SECRET)).toBe(false);
    expect(await checkPasscode("open-sesame", "open-sesame", SECRET)).toBe(true);
  });

  it("returns 401 for a missing cookie", async () => {
    expect((await requireAuth(req(), env))?.status).toBe(401);
  });

  it("returns 401 for a forged or tampered cookie", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect((await requireAuth(req(`${AUTH_COOKIE}=${exp}.deadbeef`), env))?.status).toBe(401);
    const forged = await createToken("x".repeat(40)); // signed with the wrong secret
    expect((await requireAuth(req(`${AUTH_COOKIE}=${forged}`), env))?.status).toBe(401);
    const real = await createToken(SECRET);
    const [e, sig] = real.split(".");
    expect((await requireAuth(req(`${AUTH_COOKIE}=${Number(e) + 99999}.${sig}`), env))?.status).toBe(401); // extended expiry
  });

  it("lets a valid cookie through", async () => {
    const token = await createToken(SECRET);
    expect(await requireAuth(req(`other=1; ${AUTH_COOKIE}=${token}`), env)).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const old = await createToken(SECRET, Date.now() - 13 * 3600 * 1000);
    expect(await verifyToken(old, SECRET)).toBe(false);
  });

  it("blocks everything in production when APP_PASSCODE is missing", async () => {
    expect(authConfig({ NODE_ENV: "production" })).toEqual({ error: "APP_PASSCODE is not configured" });
    expect((await requireAuth(req(), { NODE_ENV: "production" }))?.status).toBe(503);
    expect(authConfig({ NODE_ENV: "development" })).toEqual({ open: true });
  });
});
