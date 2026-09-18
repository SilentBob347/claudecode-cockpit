'use client';

import { addBot, notifyBotsChanged } from '@cockpit/shared-api';
import { useAddToRegistry, type RegistryAdder } from './useAddToRegistry';

// Module-level so the hook's useCallback deps stay referentially stable.
const BOTS: RegistryAdder = {
  add: addBot,
  notify: notifyBotsChanged,
  namespace: 'bots',
  failureKey: 'bots.saveFailed',
};

/** Register the Bot directory of a BOT.md (absolute path) in bot.json. */
export const useAddBot = (): ((path: string) => Promise<void>) => useAddToRegistry(BOTS);
