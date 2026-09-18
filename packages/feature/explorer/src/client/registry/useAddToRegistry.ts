'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Effect } from 'effect';
import type { AppError } from '@cockpit/effect-core';
import { toast } from '@cockpit/shared-ui';
import { failureMessage } from '@cockpit/shared-api';
import { BrowserRuntime } from '@cockpit/effect-runtime';

export interface RegistryAdder {
  /** POST the absolute path to the registry. */
  readonly add: (path: string) => Effect.Effect<{ readonly alreadyExists: boolean }, AppError>;
  /** Cross-frame refresh; fired only on a real insert. */
  readonly notify: () => void;
  /** i18n namespace holding `added` / `alreadyAdded` and the failure key. */
  readonly namespace: 'skills' | 'bots';
  readonly failureKey: string;
}

/**
 * Shared "register this file" action behind the explorer's SKILL.md / BOT.md
 * buttons: toasts added / already added / the backend's error, and notifies
 * the registry bus so modals and chat autocomplete refresh.
 *
 * No client-side validation on purpose — the server is the single gate, so
 * the button and the manual "add" dialog accept exactly the same inputs.
 */
export function useAddToRegistry({ add, notify, namespace, failureKey }: RegistryAdder): (path: string) => Promise<void> {
  const { t } = useTranslation();
  return useCallback(async (path: string) => {
    const exit = await BrowserRuntime.runPromiseExit(add(path));
    if (exit._tag === 'Success') {
      if (exit.value.alreadyExists) {
        toast(t(`${namespace}.alreadyAdded`), 'info');
      } else {
        toast(t(`${namespace}.added`), 'success');
        notify();
      }
    } else {
      toast(failureMessage(exit.cause, t(failureKey)), 'error');
    }
  }, [add, notify, namespace, failureKey, t]);
}
