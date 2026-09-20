#!/usr/bin/env node

// cockpit-dev: dev-mode entry. Sets dev env + delegates to cockpit.mjs which
// holds the shared subcommand dispatcher. The prod entry binaries are
// `cockpit`; dev mode uses the full name only.
process.env.COCKPIT_ENV = 'dev';
process.env.COCKPIT_PORT = process.env.COCKPIT_PORT || '3456';
await import('./cockpit.mjs');
