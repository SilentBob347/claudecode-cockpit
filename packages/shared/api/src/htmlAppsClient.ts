/**
 * Client-side HTML-apps registry IO — Effect wrappers. Mirrors skillsClient.
 *   - GET    /api/html-apps        — list (enriched with <title>/<meta>)
 *   - POST   /api/html-apps        — add by absolute path
 *   - DELETE /api/html-apps/:id    — remove
 *
 * Lives in shared-api for the same reason as skillsRegistryClient: two features
 * need the endpoint. feature-explorer owns the registry UI (HtmlAppsModal, the
 * "add" button), and feature-console reads the list for the `/name` autocomplete
 * in ConsoleInputBar. The console side used to hand-roll its own `fetch` to
 * avoid a cross-package import — exactly the "second client, written from
 * scratch" pattern that produced the /api/files/clipboard and
 * /api/scheduled-tasks field mismatches.
 */
import { Effect } from "effect"
import { AppError } from "@cockpit/effect-core"
import { httpJson } from "./httpJson"

export interface HtmlAppInfo {
  id: string
  path: string
  addedAt: string
  name: string
  title: string
  description: string
  icon?: string
  valid: boolean
  /**
   * Shipped under /apps and merged in at read time — not stored in html.json,
   * so it cannot be deleted. Absent/false for user-registered apps.
   */
  builtin?: boolean
}


/** GET /api/html-apps — backend returns Array<HtmlAppInfo> directly. */
export const loadHtmlApps = (): Effect.Effect<ReadonlyArray<HtmlAppInfo>, AppError> =>
  httpJson<ReadonlyArray<HtmlAppInfo>>("/api/html-apps")

export interface AddHtmlAppResult extends HtmlAppInfo {
  /** True when the path was already registered (no new entry written). */
  alreadyExists: boolean
}

export const addHtmlApp = (path: string): Effect.Effect<AddHtmlAppResult, AppError> =>
  httpJson<AddHtmlAppResult>("/api/html-apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })

export const deleteHtmlApp = (id: string): Effect.Effect<unknown, AppError> =>
  httpJson(`/api/html-apps/${encodeURIComponent(id)}`, { method: "DELETE" })
