import { describe, it, expect } from 'vitest';
import { buildSessionLink, parseSessionLink } from './sessionLink';

describe('sessionLink', () => {
  it('round-trips cwd and sessionId, including spaces and CJK', () => {
    const cwd = '/Users/ka/My Notes/笔记';
    const link = buildSessionLink(cwd, 'abc-123');
    expect(link.startsWith('/project?')).toBe(true);
    expect(parseSessionLink(link)).toEqual({ cwd, sessionId: 'abc-123' });
  });

  it('accepts an absolute URL only on the current origin', () => {
    const href = 'http://localhost:3456/project?cwd=%2Ftmp&sessionId=s1';
    expect(parseSessionLink(href, 'http://localhost:3456')).toEqual({ cwd: '/tmp', sessionId: 's1' });
    expect(parseSessionLink(href)).toBeNull();
    expect(parseSessionLink('https://example.org/project?cwd=%2Ftmp&sessionId=s1', 'http://localhost:3456')).toBeNull();
  });

  it('rejects look-alikes that resolve to another host', () => {
    expect(parseSessionLink('//example.org/project?cwd=%2Ftmp&sessionId=s1', 'http://localhost:3456')).toBeNull();
    expect(parseSessionLink('/\\example.org/project?cwd=%2Ftmp&sessionId=s1', 'http://localhost:3456')).toBeNull();
  });

  it('rejects other paths, missing params and non-http schemes', () => {
    expect(parseSessionLink('/review/1?cwd=/tmp&sessionId=s')).toBeNull();
    expect(parseSessionLink('/project?cwd=%2Ftmp')).toBeNull();
    expect(parseSessionLink('javascript:alert(1)', 'http://localhost:3456')).toBeNull();
    expect(parseSessionLink('/docs/project.md')).toBeNull();
    expect(parseSessionLink(undefined)).toBeNull();
  });
});
