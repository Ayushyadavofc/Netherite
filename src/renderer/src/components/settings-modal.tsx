import { useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, Eye, EyeOff, Palette, SlidersHorizontal, Sparkles, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'

import { useProfile } from '@/hooks/use-data'
import {
  DATABASE_ID,
  USER_SETTINGS_COLLECTION_ID,
  databases,
  isAppwriteConfigured
} from '@/lib/appwrite'
import { useAuthStore } from '@/stores/authStore'

import {
  applyVaultTheme,
  createCustomPaletteFromPreset,
  defaultVaultConfig,
  getCurrentVaultPath,
  getThemePreviewPalette,
  loadVaultConfig,
  normalizeVaultConfig,
  saveVaultConfig,
  themeColorFields,
  themePalettes,
  type ThemeColorKey,
  type VaultConfig
} from '@/lib/vault-config'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [initialConfig, setInitialConfig] = useState(defaultVaultConfig)
  const [draftConfig, setDraftConfig] = useState(defaultVaultConfig)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [storedProfile, setStoredProfile] = useProfile()
  const [geminiKey, setGeminiKey] = useState('')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false)
  const [geminiKeySaved, setGeminiKeySaved] = useState(false)
  const currentUser = useAuthStore((state) => state.user)

  const activePalette = useMemo(() => getThemePreviewPalette(draftConfig), [draftConfig])
  const activeAccent = draftConfig.theme.customAccent ?? activePalette.primary

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const nextVaultPath = getCurrentVaultPath()
    setVaultPath(nextVaultPath)
    setSavedMessage(null)

    if (!nextVaultPath) {
      setDraftConfig(defaultVaultConfig)
      setInitialConfig(defaultVaultConfig)
      setError('Open a vault first to edit its Netherite settings.')
      return
    }

    let cancelled = false

    const loadConfig = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const config = await loadVaultConfig(nextVaultPath)
        if (cancelled) {
          return
        }

        setInitialConfig(config)
        setDraftConfig(config)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load this vault settings file.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setGeminiKey(storedProfile.geminiApiKey ?? '')
      setGeminiKeySaved(false)
    }
  }, [isOpen, storedProfile.geminiApiKey])

  useEffect(() => {
    if (!isOpen || isLoading) {
      return
    }

    applyVaultTheme(draftConfig)
  }, [draftConfig, isLoading, isOpen])

  const updateDraft = (updater: (current: VaultConfig) => VaultConfig) => {
    setDraftConfig((current) => updater(current))
    setSavedMessage(null)
  }

  const handleClose = () => {
    applyVaultTheme(initialConfig)
    onClose()
  }

  const handleSave = async () => {
    if (!vaultPath) {
      return
    }

    setIsSaving(true)
    setError(null)
    setSavedMessage(null)

    try {
      const savedConfig = await saveVaultConfig(vaultPath, normalizeVaultConfig(draftConfig))
      setInitialConfig(savedConfig)
      setDraftConfig(savedConfig)
      applyVaultTheme(savedConfig)
      setSavedMessage('Vault theme saved and applied.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this vault config.')
    } finally {
      setIsSaving(false)
    }
  }

  const activatePreset = (preset: VaultConfig['theme']['preset']) => {
    updateDraft((current) => {
      if (preset === 'custom') {
        return {
          ...current,
          theme: {
            ...current.theme,
            preset: 'custom'
          }
        }
      }

      return {
        ...current,
        theme: {
          ...current.theme,
          preset
        }
      }
    })
  }

  const startCustomThemeFromCurrent = () => {
    updateDraft((current) => ({
      ...current,
      theme: {
        ...current.theme,
        preset: 'custom',
        customPalette:
          current.theme.preset === 'custom'
            ? { ...current.theme.customPalette }
            : createCustomPaletteFromPreset(current.theme.preset)
      }
    }))
  }

  const updateCustomColor = (key: ThemeColorKey, value: string) => {
    updateDraft((current) => ({
      ...current,
      theme: {
        ...current.theme,
        preset: 'custom',
        customPalette: {
          ...current.theme.customPalette,
          [key]: value
        }
      }
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[20px] border border-[var(--nv-border)] bg-[var(--nv-bg)] shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-white">Vault Settings</h2>
            <p className="mt-1 text-sm text-[var(--nv-muted)]">
              Theme and preferences are stored in your account data and follow you across vaults.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-2 text-[var(--nv-muted)] transition-colors hover:bg-[var(--nv-surface)] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1.28fr_0.72fr]">
          <div className="overflow-y-auto border-r border-[var(--nv-border)] p-6">
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
                  <Palette className="h-4 w-4" />
                  Theme Presets
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {themePalettes.map((palette) => {
                    const active = draftConfig.theme.preset === palette.id

                    return (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => activatePreset(palette.id)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          active
                            ? 'border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]'
                            : 'border-[var(--nv-border)] bg-[var(--nv-surface)] hover:border-[var(--nv-primary)]/60'
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">{palette.name}</span>
                          {active ? <CheckCircle2 className="h-4 w-4 text-[var(--nv-primary)]" /> : null}
                        </div>
                        <div className="mb-3 flex gap-2">
                          <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: palette.primary }} />
                          <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: palette.secondary }} />
                          <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: palette.surfaceStrong }} />
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--nv-muted)]">{palette.description}</p>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => activatePreset('custom')}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      draftConfig.theme.preset === 'custom'
                        ? 'border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]'
                        : 'border-[var(--nv-border)] bg-[var(--nv-surface)] hover:border-[var(--nv-primary)]/60'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Custom Theme</span>
                      {draftConfig.theme.preset === 'custom' ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--nv-primary)]" />
                      ) : (
                        <Wand2 className="h-4 w-4 text-[var(--nv-primary)]" />
                      )}
                    </div>
                    <div className="mb-3 flex gap-2">
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: draftConfig.theme.customPalette.primary }} />
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: draftConfig.theme.customPalette.secondary }} />
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: draftConfig.theme.customPalette.surfaceStrong }} />
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--nv-muted)]">
                      Build your own vault look by tweaking every core color.
                    </p>
                  </button>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
                  <Wand2 className="h-4 w-4" />
                  Custom Theme Studio
                </div>
                <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Create your own palette</p>
                      <p className="text-xs text-[var(--nv-muted)]">
                        Start from the current preset, then tune every key color live.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startCustomThemeFromCurrent}
                      className="rounded-xl border border-[var(--nv-border)] px-4 py-2 text-sm font-medium text-[var(--nv-muted)] transition-colors hover:border-[var(--nv-primary)] hover:text-white"
                    >
                      Use current theme as base
                    </button>
                  </div>

                  {draftConfig.theme.preset === 'custom' ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {themeColorFields.map((field) => (
                        <label
                          key={field.key}
                          className="flex items-center gap-3 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-4 py-3"
                        >
                          <input
                            type="color"
                            value={draftConfig.theme.customPalette[field.key]}
                            onChange={(event) => updateCustomColor(field.key, event.target.value)}
                            className="h-11 w-11 cursor-pointer rounded-xl border border-[var(--nv-border)] bg-transparent"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{field.label}</p>
                            <p className="text-xs text-[var(--nv-muted)]">{field.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[var(--nv-muted)]">
                      Pick <span className="font-semibold text-white">Custom Theme</span> or press
                      {' '}<span className="font-semibold text-white">Use current theme as base</span> to unlock full palette editing.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
                  <Sparkles className="h-4 w-4" />
                  Accent
                </div>
                <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-3">
                      <input
                        type="color"
                        value={activeAccent}
                        onChange={(event) => {
                          updateDraft((current) => ({
                            ...current,
                            theme: {
                              ...current.theme,
                              customAccent: event.target.value
                            }
                          }))
                        }}
                        className="h-12 w-12 cursor-pointer rounded-full border border-[var(--nv-border)] bg-transparent"
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">Custom accent</p>
                        <p className="text-xs text-[var(--nv-muted)]">Override the primary signal color across the app.</p>
                      </div>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        updateDraft((current) => ({
                          ...current,
                          theme: {
                            ...current.theme,
                            customAccent: null
                          }
                        }))
                      }}
                      className="rounded-xl border border-[var(--nv-border)] px-4 py-2 text-sm font-medium text-[var(--nv-muted)] transition-colors hover:border-[var(--nv-primary)] hover:text-white"
                    >
                      Use theme primary
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
                  <SlidersHorizontal className="h-4 w-4" />
                  Preferences
                </div>
                <div className="space-y-3">
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Show vault stats in sidebar</p>
                      <p className="text-xs text-[var(--nv-muted)]">Keeps the right-hand dashboard details visible.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={draftConfig.preferences.showVaultStats}
                      onChange={(event) => {
                        updateDraft((current) => ({
                          ...current,
                          preferences: {
                            ...current.preferences,
                            showVaultStats: event.target.checked
                          }
                        }))
                      }}
                      className="h-4 w-4 accent-[var(--nv-primary)]"
                    />
                  </label>

                  <label className="flex items-center justify-between rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Enable scraps animations</p>
                      <p className="text-xs text-[var(--nv-muted)]">Preserves the animated reward feedback in progress screens.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={draftConfig.preferences.enableScrapsAnimations}
                      onChange={(event) => {
                        updateDraft((current) => ({
                          ...current,
                          preferences: {
                            ...current.preferences,
                            enableScrapsAnimations: event.target.checked
                          }
                        }))
                      }}
                      className="h-4 w-4 accent-[var(--nv-primary)]"
                    />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
                  <Bot className="h-4 w-4" />
                  AI Integration
                </div>
                <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Groq API Key</p>
                    <p className="mt-1 text-xs text-[var(--nv-muted)]">
                      Used for AI-powered flashcard generation from your notes.
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        id="gemini-api-key-input"
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiKey}
                        onChange={(event) => {
                          setGeminiKey(event.target.value)
                          setGeminiKeySaved(false)
                        }}
                        placeholder="Paste your Groq API key"
                        className="h-10 w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-3 pr-10 text-sm text-white placeholder-[var(--nv-muted)] outline-none transition-colors focus:border-[var(--nv-primary)]"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey((prev) => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--nv-muted)] transition-colors hover:text-white"
                        aria-label={showGeminiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingGeminiKey}
                      onClick={async () => {
                        setIsSavingGeminiKey(true)
                        setGeminiKeySaved(false)
                        try {
                          setStoredProfile((prev) => ({
                            ...prev,
                            geminiApiKey: geminiKey.trim()
                          }))

                          if (isAppwriteConfigured() && currentUser) {
                            try {
                              await databases.updateDocument(
                                DATABASE_ID,
                                USER_SETTINGS_COLLECTION_ID,
                                currentUser.$id,
                                { gemini_api_key: geminiKey.trim() }
                              )
                            } catch {
                              // Appwrite sync is best-effort; local save succeeded
                            }
                          }

                          setGeminiKeySaved(true)
                          toast.success('Groq API key saved.')
                        } catch {
                          toast.error('Could not save the API key.')
                        } finally {
                          setIsSavingGeminiKey(false)
                        }
                      }}
                      className="h-10 shrink-0 rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium text-[var(--nv-muted)] transition-colors hover:border-[var(--nv-primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingGeminiKey ? 'Saving...' : geminiKeySaved ? '✓ Saved' : 'Save Key'}
                    </button>
                  </div>

                  {!geminiKey.trim() && !geminiKeySaved ? (
                    <p className="mt-3 text-xs text-[var(--nv-muted)]">
                      Get your key at{' '}
                      <a
                        href="https://console.groq.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--nv-primary)] underline decoration-[var(--nv-primary)]/40 underline-offset-2 transition-colors hover:text-white"
                      >
                        console.groq.com
                      </a>
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>

          <div className="overflow-y-auto p-6">
            <div className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
              Live Preview
            </div>
            <div className="rounded-[24px] border border-[var(--nv-border)] p-4" style={{ backgroundColor: activePalette.background }}>
              <div className="rounded-[18px] border p-4" style={{ borderColor: activePalette.border, backgroundColor: activePalette.surfaceStrong }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em]" style={{ color: activePalette.secondary }}>Theme</p>
                    <h3 className="mt-2 text-2xl font-bold" style={{ color: activePalette.foreground }}>
                      {activePalette.name}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed" style={{ color: activePalette.muted }}>
                      {activePalette.description}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full border" style={{ borderColor: activePalette.border, backgroundColor: activeAccent }} />
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: activePalette.border, backgroundColor: activePalette.surface }}>
                    <p className="text-sm font-semibold" style={{ color: activePalette.foreground }}>Background + surfaces</p>
                    <p className="text-xs" style={{ color: activePalette.muted }}>Main panels, dialogs, and cards follow these tones.</p>
                  </div>
                  <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: activeAccent, color: '#111111' }}>
                    Accent buttons and active states
                  </div>
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: activePalette.border, backgroundColor: activePalette.background }}>
                    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: activePalette.subtle }}>
                      Muted copy and timestamps
                    </p>
                    <p className="mt-2 text-sm font-semibold" style={{ color: activePalette.secondary }}>
                      Secondary highlight tone
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
              <p className="text-sm font-semibold text-white">Vault path</p>
              <p className="mt-2 break-all text-xs text-[var(--nv-muted)]">{vaultPath ?? 'No vault selected'}</p>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-[var(--nv-danger)]/40 bg-[var(--nv-danger-soft)] px-4 py-3 text-sm text-[#ffd7d1]">
                {error}
              </div>
            ) : null}

            {savedMessage ? (
              <div className="mt-5 rounded-2xl border border-[var(--nv-primary)]/35 bg-[var(--nv-primary-soft)] px-4 py-3 text-sm text-white">
                {savedMessage}
              </div>
            ) : null}

            {isLoading ? (
              <p className="mt-5 text-sm text-[var(--nv-muted)]">Loading vault settings...</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--nv-border)] px-6 py-4">
          <p className="text-xs text-[var(--nv-muted)]">Theme changes preview live and save into the current vault.</p>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="rounded-xl border border-[var(--nv-border)] px-5 py-2.5 text-sm font-medium text-[var(--nv-muted)] transition-colors hover:border-[var(--nv-primary)] hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!vaultPath || isSaving || isLoading}
              className="rounded-xl bg-[var(--nv-primary)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
