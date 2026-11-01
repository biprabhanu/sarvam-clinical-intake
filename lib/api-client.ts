// Browser-side fetch wrapper: never throws, always returns a plain-language error on failure.
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export function messageForStatus(status: number): string {
  if (status === 0) return "Network problem — check your connection and try again.";
  if (status === 401) return "Please log in again.";
  if (status === 403) return "You are not allowed to do this.";
  if (status === 404) return "Not found — it may have been deleted.";
  if (status === 409) return "Someone else changed this at the same moment — please try again.";
  if (status === 413) return "File too large.";
  if (status === 415) return "This file type is not supported.";
  if (status === 429) return "Too many requests — please wait a moment and try again.";
  if (status >= 500) return "The server is busy, please try again.";
  return `Request failed (${status}).`;
}

export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, data: null, error: messageForStatus(0) };
  }
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null; // plain-text or HTML error page (e.g. Vercel's FUNCTION_PAYLOAD_TOO_LARGE)
  }
  if (res.ok) return { ok: true, status: res.status, data: data as T, error: null };
  const serverMsg = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : null;
  return { ok: false, status: res.status, data: null, error: serverMsg ?? messageForStatus(res.status) };
}
