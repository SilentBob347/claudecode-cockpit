/**
 * Cockpit session links — the one format every server reply and client link
 * handler agree on. Browser-safe (no node imports), exported via the
 * `@cockpit/shared-utils/sessionLink` subpath so client bundles never pull
 * in the node-only modules re-exported from the package index.
 *
 * The link is the real `/project` route (same shape as the workspace's
 * buildProjectUrl), relative on purpose: react-markdown's defaultUrlTransform
 * strips custom schemes, and a relative URL still works when opened directly.
 */

export interface SessionLinkTarget {
  cwd: string;
  sessionId: string;
}

export function buildSessionLink(cwd: string, sessionId: string): string {
  return `/project?cwd=${encodeURIComponent(cwd)}&sessionId=${encodeURIComponent(sessionId)}&view=agent`;
}

const RELATIVE_BASE = 'http://cockpit.invalid';

/**
 * Parse a Cockpit session link. Accepts a root-relative `/project?cwd=…&sessionId=…`
 * (what the server emits), or an absolute URL only when its origin equals
 * `currentOrigin` — so an external site's look-alike link is never mistaken for a
 * local session. Protocol-relative (`//host/…`) and backslash (`/\\host/…`) forms are
 * rejected: they resolve to another host.
 */
export function parseSessionLink(
  href: string | undefined | null,
  currentOrigin?: string,
): SessionLinkTarget | null {
  if (!href) return null;
  const raw = href.trim();
  let url: URL;
  try {
    if (raw.startsWith('/')) {
      url = new URL(raw, RELATIVE_BASE);
      if (url.origin !== RELATIVE_BASE) return null;
    } else {
      if (!currentOrigin) return null;
      url = new URL(raw);
      if (url.origin !== currentOrigin) return null;
    }
  } catch {
    return null;
  }
  if (url.pathname !== '/project') return null;
  const cwd = url.searchParams.get('cwd');
  const sessionId = url.searchParams.get('sessionId');
  if (!cwd || !sessionId) return null;
  return { cwd, sessionId };
}
