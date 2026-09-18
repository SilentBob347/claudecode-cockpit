import { Context, Effect } from "effect"
import type { CockpitError } from "@cockpit/effect-core"

export interface BotRegistration {
  readonly id: string
  /** Absolute path of the Bot directory (the one containing BOT.md). */
  readonly path: string
  readonly addedAt: string
}

/**
 * Built-in Bots ship inside the package and are merged into the listing at read
 * time, so they carry no bot.json record: `id` is `builtin:<dir>`, `addedAt` is
 * empty, and they can be neither added nor removed. Absent on registered Bots.
 *
 * `path` is the user's copy under ~/.cockpit/bots, which `list` installs from
 * the shipped seed on first sight — not the install root the seed lives in.
 */
export interface BotOrigin {
  readonly builtin?: boolean
}

/**
 * A Bot as resolved right now: usable (name + description from BOT.md) or not
 * (name falls back to the directory name, plus the reason).
 */
export type BotSummary =
  | (BotRegistration & BotOrigin & { readonly valid: true; readonly name: string; readonly description: string })
  | (BotRegistration & BotOrigin & { readonly valid: false; readonly name: string; readonly error: string })

export type AddBotResult = BotSummary & {
  /** True when the directory was already registered (no new entry written). */
  readonly alreadyExists: boolean
}

export interface BotRegistryService {
  readonly list: Effect.Effect<ReadonlyArray<BotSummary>, CockpitError>
  readonly add: (path: string) => Effect.Effect<AddBotResult, CockpitError>
  readonly remove: (id: string) => Effect.Effect<void, CockpitError>
}

export const BotRegistryService = Context.GenericTag<BotRegistryService>(
  "@cockpit/BotRegistryService"
)
