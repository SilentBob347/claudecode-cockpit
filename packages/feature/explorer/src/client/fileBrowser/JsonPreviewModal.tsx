'use client';

import type { RefObject } from 'react';
import { type useJsonSearch, JsonSearchBar } from '@cockpit/shared-ui';
import { formatAsHumanReadable } from '../toolCallUtils';

export interface JsonPreviewState {
  content: string;
  filePath: string;
}

interface JsonPreviewModalProps {
  preview: JsonPreviewState;
  onClose: () => void;
  /** Cmd+F search over the formatted text; owned by the host so its key
   *  handler can open/close it alongside the rest of its ESC layering. */
  search: ReturnType<typeof useJsonSearch>;
  preRef: RefObject<HTMLPreElement | null>;
}

/**
 * JSON "readable" overlay. Absolutely positioned — the host must supply a
 * `relative` container that bounds it (it must not spill into sibling panels).
 */
export function JsonPreviewModal({ preview, onClose, search, preRef }: JsonPreviewModalProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-lv3 w-full max-w-[90%] h-[90%] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
          <span className="text-sm text-muted-foreground font-mono truncate">{preview.filePath}</span>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-hover rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <JsonSearchBar search={search} />
        <div className="flex-1 overflow-auto px-6 py-4 bg-secondary">
          <pre
            ref={preRef}
            className="whitespace-pre-wrap break-words font-mono text-foreground"
            style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}
          >
            {formatAsHumanReadable(preview.content)}
          </pre>
        </div>
      </div>
    </div>
  );
}
