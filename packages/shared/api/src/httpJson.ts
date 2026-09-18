/**
 * The one JSON fetch helper for this package's registry clients.
 *
 * A non-2xx response surfaces the backend's `body.error` as the cause's
 * message, so callers can toast it verbatim; any other failure keeps its
 * original cause. Three clients (skills, bots, html-apps) used to carry
 * byte-identical copies of this.
 */
import { Effect } from "effect"
import { AppError } from "@cockpit/effect-core"

export const httpJson = <A>(url: string, init?: RequestInit): Effect.Effect<A, AppError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, init)
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      return (await res.json()) as A
    },
    catch: (cause) => new AppError({ message: `${init?.method ?? "GET"} ${url} failed`, cause }),
  })

/** POST a JSON body. */
export const postJson = <A>(url: string, body: unknown): Effect.Effect<A, AppError> =>
  httpJson<A>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

/**
 * The message to show for a failed registry call: the backend's `body.error`
 * when present (wrapped as AppError.cause by httpJson), else `fallback`.
 */
export const failureMessage = (cause: unknown, fallback: string): string => {
  if (cause && typeof cause === "object" && "_tag" in cause && cause._tag === "Fail" && "error" in cause) {
    const inner = (cause.error as { cause?: unknown } | null)?.cause
    if (inner instanceof Error) return inner.message
  }
  return fallback
}
