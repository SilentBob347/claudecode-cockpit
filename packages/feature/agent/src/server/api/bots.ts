import { Effect } from "effect"
import { ValidationError } from "@cockpit/effect-core"
import { BotRegistryService } from "@cockpit/effect-services"
import { handler, ok, parseJsonRaw } from "@cockpit/effect-runtime/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handler(() =>
  Effect.gen(function* () {
    const registry = yield* BotRegistryService
    return ok(yield* registry.list)
  })
)

export const POST = handler((req) =>
  Effect.gen(function* () {
    const registry = yield* BotRegistryService
    const body = (yield* parseJsonRaw(req)) as { path?: unknown }
    if (typeof body.path !== "string") {
      return yield* Effect.fail(new ValidationError({ field: "path", reason: "missing" }))
    }
    return ok(yield* registry.add(body.path))
  })
)
