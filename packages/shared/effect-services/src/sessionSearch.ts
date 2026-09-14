/**
 * SessionSearchService — cross-project, cross-engine search over past sessions.
 *
 * Every session in every engine store (claude, codex, and the built-in engines)
 * is kept as a derived plain-text copy — prompts and replies only — under
 * `<cockpitDir>/search-corpus`, refreshed incrementally, and searched with
 * ripgrep so any substring (including 2-character Chinese words) matches.
 *
 * Live implementation: packages/feature/agent/src/effect/sessionSearchLive.ts
 */
import { Context, Effect } from "effect"
import type { AppError, FSError } from "@cockpit/effect-core"

export interface SessionSearchQuery {
  /** Case-insensitive fixed-string keywords; more distinct matches rank higher. */
  readonly terms: ReadonlyArray<string>
  /** Only sessions whose project is this directory or below it. */
  readonly cwd?: string
  /** Only sessions updated at or after this epoch-ms instant. */
  readonly since?: number
  readonly limit: number
}

export interface SessionSearchHit {
  readonly engine: string
  readonly sessionId: string
  readonly cwd: string | null
  readonly title: string
  readonly updatedAt: number
  /** Null when the session's project directory is unknown. */
  readonly link: string | null
  readonly matchCount: number
  readonly matchedTerms: ReadonlyArray<string>
  readonly snippets: ReadonlyArray<string>
}

export interface CorpusSyncStats {
  readonly sources: number
  readonly indexed: number
  readonly rebuilt: number
  readonly removed: number
}

export interface SessionSearchService {
  /** Bring the corpus up to date (incremental). Concurrent calls run one at a time. */
  readonly sync: Effect.Effect<CorpusSyncStats, FSError>
  readonly search: (
    query: SessionSearchQuery
  ) => Effect.Effect<ReadonlyArray<SessionSearchHit>, AppError>
}

export const SessionSearchService = Context.GenericTag<SessionSearchService>(
  "@cockpit/SessionSearchService"
)
