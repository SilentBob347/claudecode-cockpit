import { Effect } from "effect"
import { ValidationError, type CockpitError } from "@cockpit/effect-core"
import { BotRegistryService } from "@cockpit/effect-services"
import { dynamicHandler, ok } from "@cockpit/effect-runtime/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const DELETE = dynamicHandler<{ id: string }, CockpitError>((_req, { id }) =>
  Effect.gen(function* () {
    if (!id) return yield* Effect.fail(new ValidationError({ field: "id", reason: "missing" }))
    const registry = yield* BotRegistryService
    yield* registry.remove(id)
    return ok({ success: true })
  })
)
