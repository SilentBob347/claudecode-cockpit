import { describe, expect, it } from 'vitest';
import { sortSessionsForDisplay } from './sessionOrder';

describe('sortSessionsForDisplay', () => {
  it('puts completed unread sessions before running sessions', () => {
    const sessions = [
      { id: 'running-newer', status: 'loading', lastActive: 400 },
      { id: 'normal-newest', status: 'normal', lastActive: 500 },
      { id: 'done-older', status: 'unread', lastActive: 100 },
      { id: 'running-older', status: 'loading', lastActive: 200 },
      { id: 'done-newer', status: 'unread', lastActive: 300 },
    ];

    expect(sortSessionsForDisplay(sessions).map((session) => session.id)).toEqual([
      'done-newer',
      'done-older',
      'running-newer',
      'running-older',
      'normal-newest',
    ]);
    expect(sessions.map((session) => session.id)).toEqual([
      'running-newer',
      'normal-newest',
      'done-older',
      'running-older',
      'done-newer',
    ]);
  });
});
