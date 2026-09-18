import { describe, it, expect, vi } from 'vitest';
import { openSessionLink, type OpenSessionLinkDeps } from './openSessionLink';

const target = { cwd: '/Users/me/proj', sessionId: 's-1' };
const href = '/project?cwd=%2FUsers%2Fka%2Fproj&sessionId=s-1&view=agent';

const deps = (framed: boolean) => ({
  isFramed: () => framed,
  publishOpenProject: vi.fn(),
  navigate: vi.fn(),
}) satisfies OpenSessionLinkDeps;

describe('openSessionLink', () => {
  it('publishes OpenProject over IframeBus with switchToAgent when framed', () => {
    const d = deps(true);
    openSessionLink(target, href, d);
    expect(d.publishOpenProject).toHaveBeenCalledWith({ cwd: '/Users/me/proj', sessionId: 's-1', switchToAgent: true });
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('navigates to the link when not framed', () => {
    const d = deps(false);
    openSessionLink(target, href, d);
    expect(d.navigate).toHaveBeenCalledWith(href);
    expect(d.publishOpenProject).not.toHaveBeenCalled();
  });
});
