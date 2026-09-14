import { publishTopic } from '@cockpit/effect-react';
import { Topics, type OpenProjectPayload } from '@cockpit/effect-services';
import type { SessionLinkTarget } from '@cockpit/shared-utils/sessionLink';

export interface OpenSessionLinkDeps {
  isFramed: () => boolean;
  publishOpenProject: (msg: OpenProjectPayload) => void;
  navigate: (href: string) => void;
}

const browserDeps: OpenSessionLinkDeps = {
  isFramed: () => window.parent !== window,
  publishOpenProject: (msg) => publishTopic(Topics.OpenProject, msg),
  navigate: (href) => window.location.assign(href),
};

/**
 * Open a Cockpit session link from inside a chat message.
 *
 * Inside the workspace every project is an iframe, so the link goes to the parent
 * Workspace over IframeBus as OpenProject — with switchToAgent, so the target
 * project's chat panel comes to front even if it was showing Explorer/Console.
 * Outside an iframe (standalone /project page, mobile) the link is a real route
 * (carrying view=agent), so just navigate to it.
 */
export function openSessionLink(
  target: SessionLinkTarget,
  href: string,
  deps: OpenSessionLinkDeps = browserDeps,
): void {
  if (deps.isFramed()) {
    deps.publishOpenProject({ cwd: target.cwd, sessionId: target.sessionId, switchToAgent: true });
    return;
  }
  deps.navigate(href);
}
