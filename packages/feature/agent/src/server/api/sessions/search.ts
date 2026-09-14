/**
 * GET /api/sessions/search?q=<term>[&q=<term>|<alt>…][&cwd=<abs dir>][&since=<ISO date|epoch ms>][&limit=<n>]
 *
 * Cross-project, cross-engine search over every past session's prompts and replies.
 * Brings the corpus up to date first (incremental; the very first call on a machine
 * extracts every transcript and can take several seconds), then searches it.
 * Backs the `/ss` skill. See SessionSearchService.
 */
import { Effect } from 'effect';
import { handler, ok } from '@cockpit/effect-runtime/server';
import { ValidationError } from '@cockpit/effect-core';
import { SessionSearchService } from '@cockpit/effect-services';
import { parseSearchTerms, parseSince } from '../../../shared/sessionSearchQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export const GET = handler((req) =>
  Effect.gen(function* () {
    const { searchParams } = new URL(req.url);
    const terms = parseSearchTerms(searchParams.getAll('q'));
    if (terms.length === 0) {
      return yield* Effect.fail(new ValidationError({ field: 'q', reason: 'missing' }));
    }
    const since = parseSince(searchParams.get('since'));
    if (since === null) {
      return yield* Effect.fail(new ValidationError({ field: 'since', reason: 'expected ISO date or epoch ms' }));
    }
    const limitRaw = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;
    const cwd = searchParams.get('cwd') || undefined;

    const search = yield* SessionSearchService;
    const corpus = yield* search.sync;
    const results = yield* search.search({ terms, cwd, since, limit });
    return ok({ terms, results, corpus });
  })
);
