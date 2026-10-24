// Small fetch helpers the real providers share. Every call returns a normalised
// result so a provider can turn it into a PublishResult without each repeating
// the try/catch and error-shape handling.

export type HttpResult<T = unknown> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function toResult<T>(res: Response): Promise<HttpResult<T>> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (res.ok) return { ok: true, data: body as T };
  // Pull the clearest message a platform error payload tends to carry.
  const b = body as Record<string, unknown> | null;
  const nested = b?.error as Record<string, unknown> | string | undefined;
  const error =
    (typeof nested === "object" && nested ? (nested.message as string) : undefined) ??
    (typeof nested === "string" ? nested : undefined) ??
    (b?.error_description as string) ??
    (b?.message as string) ??
    (typeof body === "string" && body ? body : `HTTP ${res.status}`);
  return { ok: false, status: res.status, error: String(error).slice(0, 500) };
}

export async function httpGet<T = unknown>(url: string, headers: Record<string, string> = {}): Promise<HttpResult<T>> {
  try {
    return await toResult<T>(await fetch(url, { headers, cache: "no-store" }));
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function httpPostForm<T = unknown>(url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<HttpResult<T>> {
  try {
    const body = new URLSearchParams(form).toString();
    return await toResult<T>(await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body, cache: "no-store" }));
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function httpPostJson<T = unknown>(url: string, json: unknown, headers: Record<string, string> = {}): Promise<HttpResult<T>> {
  try {
    return await toResult<T>(await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(json), cache: "no-store" }));
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** A 4xx other than 429 is the caller's fault and not worth retrying; 429 and 5xx are. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}
