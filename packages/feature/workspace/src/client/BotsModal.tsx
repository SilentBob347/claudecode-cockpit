'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, FolderOpen, FolderPlus, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BrowserRuntime } from '@cockpit/effect-runtime'
import { publishTopic } from '@cockpit/effect-react'
import { Topics } from '@cockpit/effect-services'
import { addBot, failureMessage, loadBots, notifyBotsChanged, removeBot, type BotInfo } from '@cockpit/shared-api'
import { MODAL_CARD_GRID_CLASS, MODAL_SHELL_CLASS, toast } from '@cockpit/shared-ui'

interface BotsModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

/**
 * Bot registry manager — same model as SkillsModal: Bots are created by the
 * `/bot` skill (or by hand) as plain directories with a BOT.md, then registered
 * here by path or from the explorer's BOT.md button. Removing only drops the
 * bot.json entry; the directory is kept.
 */
export function BotsModal({ isOpen, onClose }: BotsModalProps) {
  const { t } = useTranslation()
  const [bots, setBots] = useState<ReadonlyArray<BotInfo>>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const exit = await BrowserRuntime.runPromiseExit(loadBots())
    if (exit._tag === 'Success') setBots(exit.value)
    else toast(failureMessage(exit.cause, t('bots.loadFailed')), 'error')
    setLoading(false)
  }, [t])

  useEffect(() => {
    if (isOpen) void reload()
  }, [isOpen, reload])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showAdd) setShowAdd(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showAdd, isOpen, onClose])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return bots
    return bots.filter((bot) => {
      const detail = bot.valid ? bot.description : bot.error
      return `${bot.name}\n${detail}\n${bot.path}`.toLowerCase().includes(needle)
    })
  }, [bots, query])

  // Built-in Bots ship with Cockpit and are always present, so they must not
  // count towards "is this panel empty?" — otherwise the first-run guidance
  // below could never appear again, and `filtered.length === 0` (the old empty
  // state) became unreachable the moment the first built-in was added.
  const userBotCount = useMemo(() => bots.filter((bot) => !bot.builtin).length, [bots])
  const searching = query.trim().length > 0
  const showGuidance = !searching && userBotCount === 0

  const unregister = useCallback(async (id: string) => {
    const exit = await BrowserRuntime.runPromiseExit(removeBot(id))
    if (exit._tag === 'Success') {
      setBots((current) => current.filter((bot) => bot.id !== id))
      notifyBotsChanged()
      toast(t('bots.removed'), 'success')
    } else {
      toast(failureMessage(exit.cause, t('bots.removeFailed')), 'error')
    }
  }, [t])

  // A Bot directory is an ordinary folder, so the project panels (explorer,
  // markdown preview, git) are the natural way to read and edit it. Opening it
  // as a project goes through the same OpenProject topic the session browser
  // and worktree switch use; in the top frame `window.parent` is this window,
  // so Workspace's own OPEN_PROJECT handler picks it up.
  const openAsProject = useCallback((path: string) => {
    publishTopic(Topics.OpenProject, { cwd: path, file: 'BOT.md' })
    onClose()
  }, [onClose])

  const openAdd = useCallback(() => setShowAdd(true), [])
  const closeAdd = useCallback(() => setShowAdd(false), [])
  const onAdded = useCallback(async () => {
    setShowAdd(false)
    await reload()
  }, [reload])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div className={MODAL_SHELL_CLASS}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-foreground">{t('bots.title')}</h2>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('bots.search')}
              className="px-2 py-1 text-xs border border-border rounded bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-hover"
            >
              <FolderPlus className="w-4 h-4" />
              {t('bots.addExisting')}
            </button>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t('common.loading')}</p>
          ) : (
            <>
              {filtered.length > 0 && (
                <div className={MODAL_CARD_GRID_CLASS}>
                  {filtered.map((bot) => (
                    <BotCard key={bot.id} bot={bot} onOpen={openAsProject} onRemove={unregister} />
                  ))}
                </div>
              )}

              {filtered.length === 0 && searching && (
                <p className="text-center text-sm text-muted-foreground py-8">{t('bots.emptyNoMatch')}</p>
              )}

              {/* Guidance is keyed to *user* Bots, so it survives the built-in
                  cards always being present. With cards above it, it reads as a
                  footer rather than a full empty state. */}
              {showGuidance && (
                <div
                  className={`text-center text-muted-foreground py-8 text-sm space-y-2${
                    filtered.length > 0 ? ' mt-4 border-t border-border/60' : ''
                  }`}
                >
                  <p>{t('bots.emptyNoBots')}</p>
                  <p>
                    {t('bots.emptyCreatePrefix')}{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs">/bot</code>
                    {' '}{t('bots.emptyCreateSuffix')}
                  </p>
                  <p>
                    <button type="button" onClick={openAdd} className="text-brand hover:underline">
                      {t('bots.emptyAddExisting')}
                    </button>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showAdd && <AddBotDialog onCancel={closeAdd} onAdded={onAdded} />}
    </div>
  )
}

interface BotCardProps {
  readonly bot: BotInfo
  /** Stable identities (useCallback) so memo holds across modal re-renders. */
  readonly onOpen: (path: string) => void
  readonly onRemove: (id: string) => void
}

const BotCard = memo(function BotCard({ bot, onOpen, onRemove }: BotCardProps) {
  const { t } = useTranslation()
  // Removing is one click away from a directory the user may have spent a long
  // time teaching. The registration is all that goes (the files stay), but the
  // card vanishing is indistinguishable from data loss at the moment it happens,
  // so it takes a second click — same two-step as an HTML app card.
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className="group rounded-lg border border-border bg-card p-3 min-w-0">
      <div className="flex items-start gap-3">
        <Bot className="w-5 h-5 mt-0.5 text-brand flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">@{bot.name}</span>
            {bot.builtin && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-muted-foreground">
                {t('bots.builtin')}
              </span>
            )}
            {!bot.valid && <span className="text-[10px] text-destructive">{t('bots.invalid')}</span>}
          </div>
          <p className={`text-xs mt-1 line-clamp-2 ${bot.valid ? 'text-muted-foreground' : 'text-destructive'}`}>
            {bot.valid ? bot.description : bot.error}
          </p>
          <p className="text-[11px] text-foreground-subtle font-mono mt-2 truncate" title={bot.path}>
            {bot.path}
          </p>
        </div>
        <div
          className={`flex items-center gap-1 transition-opacity ${
            confirmDel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          }`}
        >
          <button
            onClick={() => onOpen(bot.path)}
            className="p-1 text-foreground-subtle hover:text-foreground"
            title={t('bots.open')}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          {/* Built-ins are virtual — there is no bot.json entry to remove. */}
          {bot.builtin ? null : confirmDel ? (
            <>
              <button
                onClick={() => { setConfirmDel(false); onRemove(bot.id) }}
                className="px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="p-1 text-foreground-subtle hover:text-destructive"
              title={t('bots.remove')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

interface AddBotDialogProps {
  readonly onCancel: () => void
  /** Called after a successful registration (new or already present). */
  readonly onAdded: () => void
}

function AddBotDialog({ onCancel, onAdded }: AddBotDialogProps) {
  const { t } = useTranslation()
  const [path, setPath] = useState('')
  const [saving, setSaving] = useState(false)

  const save = useCallback(async () => {
    const value = path.trim()
    if (!value || saving) return
    setSaving(true)
    const exit = await BrowserRuntime.runPromiseExit(addBot(value))
    setSaving(false)
    if (exit._tag === 'Success') {
      const { alreadyExists } = exit.value
      toast(t(alreadyExists ? 'bots.alreadyAdded' : 'bots.added'), alreadyExists ? 'info' : 'success')
      if (!alreadyExists) notifyBotsChanged()
      onAdded()
    } else {
      toast(failureMessage(exit.cause, t('bots.saveFailed')), 'error')
    }
  }, [path, saving, onAdded, t])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={() => !saving && onCancel()} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-sm font-medium text-foreground mb-4">{t('bots.addExisting')}</h3>
        <input
          autoFocus
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) void save()
          }}
          placeholder={t('bots.pathPlaceholder')}
          className="w-full px-3 py-2 text-sm font-mono border border-border rounded bg-background"
        />
        <p className="text-xs text-muted-foreground mt-3">{t('bots.addHint')}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button disabled={saving} onClick={onCancel} className="px-3 py-1.5 text-xs rounded border border-border">
            {t('common.cancel')}
          </button>
          <button
            disabled={saving || !path.trim()}
            onClick={() => void save()}
            className="px-3 py-1.5 text-xs rounded bg-brand text-white disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
