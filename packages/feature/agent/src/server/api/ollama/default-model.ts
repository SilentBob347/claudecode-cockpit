/**
 * /api/ollama/default-model — what a brand-new ollama session would run on.
 *
 * Exists so the UI never has to reimplement the choice. Every other engine seeds a new tab
 * with a model literal (`k3`, `glm-5.3`) because a hosted provider's ids are stable; ollama's
 * are whatever this machine pulled, so the tab asks the server the same question dispatch
 * asks — resolveDefaultOllamaModel — and gets the same answer.
 *
 * A failure is an AgentError → 503 carrying the reason. The caller is seeding a tab, not
 * running anything, so it is free to ignore that and leave the picker empty; the same reason
 * comes back with full context if a message is actually sent.
 */
import { Effect } from "effect"
import { handler, ok } from "@cockpit/effect-runtime/server"
import { AgentError } from "@cockpit/effect-core"
import { resolveDefaultOllamaModel } from "../../engines/ollama"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handler(() =>
  Effect.gen(function* () {
    const choice = yield* Effect.promise(() => resolveDefaultOllamaModel())
    if (!choice.ok) {
      return yield* Effect.fail(
        new AgentError({ provider: "ollama", kind: "protocol", cause: new Error(choice.reason) })
      )
    }
    return ok({ model: choice.model })
  })
)
