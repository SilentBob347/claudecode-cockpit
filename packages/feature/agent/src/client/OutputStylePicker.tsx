'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Palette, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Portal, usePanelPortalTarget } from '@cockpit/shared-ui';
import {
  ENGINE_MENU_CLASS,
  ENGINE_MENU_ROW_SELECTED,
  EngineCheck,
  EnginePickerTrigger,
} from './engineAccents';
import { OutputStylesManager } from './OutputStylesManager';
import { refreshOutputStyles, saveOutputStyles, useOutputStyles } from './outputStylesStore';

/**
 * Toolbar pill that selects this session's output style — text the server appends
 * to the engine's system prompt on every turn. `''` means none (nothing injected).
 *
 * The pencil in the menu header opens the one-textarea manager, mirroring the
 * quick-instructions popover's header pencil.
 */
export function OutputStylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (styleId: string) => void;
}) {
  const { t } = useTranslation();
  const styles = useOutputStyles();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const panelTarget = usePanelPortalTarget();

  // A selection whose style was deleted or renamed reads as "none" — the server
  // resolves the same id to nothing, so the label says what will actually happen.
  const selected = styles.find((s) => s.id === value);
  const noneLabel = t('chat.outputStyleNone');
  const label = selected?.name ?? noneLabel;

  const updatePosition = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Portaled into the current panel, so coordinates are panel-relative.
    const origin = panelTarget?.getBoundingClientRect();
    setPos({ top: rect.bottom + 4 - (origin?.top ?? 0), left: rect.left - (origin?.left ?? 0) });
  }, [panelTarget]);

  const toggle = () => {
    if (!open) {
      updatePosition();
      void refreshOutputStyles(true);
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const rowClass = (isSelected: boolean) =>
    `flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors ${
      isSelected ? ENGINE_MENU_ROW_SELECTED : 'text-muted-foreground hover:bg-hover hover:text-foreground'
    }`;

  return (
    <div className="relative">
      <EnginePickerTrigger
        buttonRef={btnRef}
        label={label}
        labelMaxWidth="max-w-[140px]"
        title={`${t('chat.outputStyle')}: ${label}`}
        onClick={toggle}
        icon={<Palette className={`h-3.5 w-3.5 flex-shrink-0 ${selected ? 'text-brand' : ''}`} />}
        testId="output-style-picker"
      />
      {open && (
        <Portal>
          <div
            ref={menuRef}
            className={`${ENGINE_MENU_CLASS} min-w-[200px] max-w-[320px]`}
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex items-center justify-between gap-2 px-3 pb-1">
              <span className="text-[11px] font-medium text-muted-foreground">{t('chat.outputStyle')}</span>
              <button
                type="button"
                onClick={() => { setOpen(false); setManaging(true); }}
                className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-hover"
                title={t('chat.editOutputStyles')}
                data-testid="output-style-edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-col">
              <button type="button" onClick={() => pick('')} className={rowClass(!selected)}>
                <span className="mt-0.5"><EngineCheck selected={!selected} /></span>
                <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
              </button>
              {styles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => pick(style.id)}
                  className={rowClass(selected?.id === style.id)}
                  title={style.content}
                >
                  <span className="mt-0.5"><EngineCheck selected={selected?.id === style.id} /></span>
                  <span className="min-w-0 flex-1 truncate">{style.name}</span>
                </button>
              ))}
              {styles.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">{t('chat.noOutputStyles')}</div>
              )}
            </div>
          </div>
        </Portal>
      )}
      {managing && (
        <OutputStylesManager
          styles={styles}
          onSave={saveOutputStyles}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  );
}
