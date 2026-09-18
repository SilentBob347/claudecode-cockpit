'use client';

import { addSkill, notifySkillsChanged } from '@cockpit/shared-api';
import { useAddToRegistry, type RegistryAdder } from './useAddToRegistry';

// Module-level so the hook's useCallback deps stay referentially stable.
const SKILLS: RegistryAdder = {
  add: addSkill,
  notify: notifySkillsChanged,
  namespace: 'skills',
  failureKey: 'skills.addFailed',
};

/** Add a SKILL.md (absolute path) to skills.json. */
export const useAddSkill = (): ((path: string) => Promise<void>) => useAddToRegistry(SKILLS);
