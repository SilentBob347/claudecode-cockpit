/**
 * /api/output-styles/config — the global output-styles library.
 *
 *   GET  → { styles }
 *   POST { styles } → full-list overwrite, echoes the normalized list
 *
 * See server/lib/outputStyles.ts for what a style is and how it is injected.
 */
import { Effect } from "effect"
import { getGlobalOutputStylesConfigPath, writeJsonFile, withFileLock } from "@cockpit/shared-utils"
import { handler, ok, parseJsonRaw } from "@cockpit/effect-runtime/server"
import { FSError } from "@cockpit/effect-core"
import { normalizeOutputStyles, readOutputStyles } from "../lib/outputStyles"

// NOTE: `runtime` / `dynamic` live in the route shim
// (src/app/api/output-styles/config/route.ts) — Next only reads them there.

export const GET = handler(() =>
  Effect.gen(function* () {
    const path = getGlobalOutputStylesConfigPath()
    const styles = yield* Effect.tryPromise({
      try: () => readOutputStyles(),
      catch: (cause) => new FSError({ path, op: "read", cause }),
    })
    return ok({ styles })
  })
)

export const POST = handler((req) =>
  Effect.gen(function* () {
    const body = (yield* parseJsonRaw(req)) as { styles?: unknown }
    const path = getGlobalOutputStylesConfigPath()
    const styles = normalizeOutputStyles(body.styles)
    // withFileLock: writeJsonFile truncates then writes, so an unserialized
    // concurrent reader (a dispatch resolving a style) could see a half file.
    yield* Effect.tryPromise({
      try: () => withFileLock(path, () => writeJsonFile(path, { styles })),
      catch: (cause) => new FSError({ path, op: "write", cause }),
    })
    // Echo what was persisted: ids for new rows are issued here.
    return ok({ success: true, styles })
  })
)
