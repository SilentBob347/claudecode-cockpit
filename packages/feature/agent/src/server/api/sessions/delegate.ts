/**
 * POST /api/sessions/delegate
 * Body: { cwd, engine?, model?, title?, prompt? | briefPath? }
 * Header (optional): x-cockpit-run-id: $COCKPIT_RUN_ID — identifies the calling session
 *
 * Starts a new session in `cwd` on `engine` and returns a receipt immediately; it does not
 * wait for the task. Nothing is stored server-side: the receipt is the record.
 * Backs the /dl skill. See DelegationService.
 */
import { Effect } from 'effect';
import { handler, ok, parseJsonRaw } from '@cockpit/effect-runtime/server';
import { DelegationService } from '@cockpit/effect-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler((req) =>
  Effect.gen(function* () {
    const raw = yield* parseJsonRaw(req);
    const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const delegation = yield* DelegationService;
    const request = yield* delegation.validate(body);
    const receipt = yield* delegation.delegate(request, req.headers.get('x-cockpit-run-id'));
    return ok(receipt);
  })
);
