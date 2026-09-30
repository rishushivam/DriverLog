const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

export class HttpError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function apiPost<TResponse>(path: string, payload: unknown, timeoutMs = 90_000): Promise<TResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const contentType = res.headers.get("content-type") ?? ""
    const body = contentType.includes("application/json") ? await res.json() : null
    if (!res.ok) {
      throw new HttpError(res.status, body, `Request failed with status ${res.status}`)
    }
    return body as TResponse
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Fire-and-forget: wakes a sleeping Render free-tier instance before the
 * user finishes filling out the form, so the real submit (and its CORS
 * preflight) is more likely to hit an already-warm server. */
export function pingHealth(): void {
  fetch(`${API_BASE_URL}/api/health/`).catch(() => {})
}

export { API_BASE_URL }
