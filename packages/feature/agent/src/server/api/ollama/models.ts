/**
 * /api/ollama/models — the installed model list, for the chat-header picker.
 *
 * The fetching itself lives in engines/ollamaCatalog so this route and the engine's model
 * resolution can never disagree about what exists. A failure stays an AgentError → 503,
 * which is the status the picker's auto-start flow keys on (client/effect/agentClient.ts).
 */
import { Effect } from "effect"
import { handler, ok } from "@cockpit/effect-runtime/server"
import { AgentError } from "@cockpit/effect-core"
import { listOllamaModels } from "../../engines/ollamaCatalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handler(() =>
  Effect.gen(function* () {
    const catalog = yield* Effect.promise(() => listOllamaModels())
    if (!catalog.ok) {
      return yield* Effect.fail(
        new AgentError({
          provider: "ollama",
          kind: "protocol",
          // `cause` carries the wire `error` string (next.ts extractErrorMessage) — the
          // reason is written for a human, so pass it through unchanged.
          cause: new Error(catalog.reason),
        })
      )
    }
    return ok({ models: catalog.models })
  })
)
