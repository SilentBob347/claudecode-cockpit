// `runtime` / `dynamic` are declared HERE, not re-exported: Next reads them by
// static analysis of the route file itself.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { GET, POST } from '@cockpit/feature-agent/server/api/output-styles-config';
