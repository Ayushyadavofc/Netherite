import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'

import { CharacterViewer } from '@/components/gacha/CharacterViewer'
import { getCharactersForGender, resolveCharacterId, type CharacterGender } from '@/lib/characters'

interface CharacterSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (characterId: string) => Promise<void>
  gender: CharacterGender
  currentCharacterId?: string | null
  showWarning?: boolean
  isLoading?: boolean
  confirmLabel?: string
}

export function CharacterSelectionModal({
  isOpen,
  onClose,
  onSelect,
  gender,
  currentCharacterId,
  showWarning = false,
  isLoading = false,
  confirmLabel = 'Select Character'
}: CharacterSelectionModalProps) {
  const characters = useMemo(() => getCharactersForGender(gender), [gender])
  const resolvedCurrentCharacter = resolveCharacterId(currentCharacterId, gender)
  const [selectedId, setSelectedId] = useState<string>(resolvedCurrentCharacter)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setSelectedId(resolveCharacterId(currentCharacterId, gender))
    setShowConfirm(false)
  }, [currentCharacterId, gender, isOpen])

  if (!isOpen) {
    return null
  }

  const selectedCharacter = selectedId || resolvedCurrentCharacter

  const selectCharacter = (characterId: string) => {
    if (isSubmitting || isLoading) {
      return
    }

    setSelectedId(characterId)

    if (characterId === resolvedCurrentCharacter) {
      setIsSubmitting(true)
      onSelect(characterId).finally(() => {
        setIsSubmitting(false)
        onClose()
      })
    } else {
      setShowConfirm(true)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSelect(selectedCharacter)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[22px] border border-[var(--nv-border)] bg-[var(--nv-bg)] shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-[var(--nv-border)] bg-[var(--nv-surface)] px-6 py-5">
          <div>
            <h2 className="text-xl font-black text-white">Choose Your Character</h2>
            <p className="mt-1 text-sm text-[var(--nv-muted)]">
              Pick the fighter you want to bring into Netherite.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isLoading}
            className="rounded-full p-2 text-[var(--nv-muted)] transition-colors hover:bg-[var(--nv-surface-strong)] hover:text-white disabled:opacity-50"
            aria-label="Close character picker"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {showConfirm ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
              <div className="mb-5 rounded-full bg-[var(--nv-danger-soft)] p-4">
                <AlertTriangle className="h-10 w-10 text-[var(--nv-danger)]" />
              </div>
              <h3 className="text-2xl font-black text-white">Confirm Character Change</h3>
              <p className="mt-4 max-w-lg whitespace-pre-line text-sm leading-7 text-[var(--nv-subtle)]">
                {'Changing your character will reset all your stats to 0.\nYour gems, scraps, streaks, and inventory will be cleared.\nThis cannot be undone. Are you sure?'}
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="rounded-xl border border-[var(--nv-border)] px-6 py-3 text-sm font-bold text-white transition-colors hover:border-[var(--nv-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting || isLoading}
                  className="rounded-xl bg-[var(--nv-danger)] px-6 py-3 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting || isLoading ? 'Applying...' : 'Yes, Reset and Change'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {characters.map((character) => {
                const isSelected = selectedCharacter === character.id
                const isCurrent = resolvedCurrentCharacter === character.id

                return (
                  <article
                    key={character.id}
                    className={`relative overflow-hidden rounded-[20px] border transition-all ${
                      isSelected
                        ? 'border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] shadow-[0_0_30px_rgba(255,86,37,0.14)]'
                        : 'border-[var(--nv-border)] bg-[var(--nv-surface)] hover:border-[var(--nv-secondary)]'
                    }`}
                  >
                    <div className="absolute right-3 top-3 flex gap-2">
                      {isCurrent ? (
                        <span className="rounded-full border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--nv-secondary)]">
                          Current
                        </span>
                      ) : null}
                      {isSelected ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--nv-primary)] text-black">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>

                    <div
                      role="button"
                      tabIndex={isSubmitting || isLoading ? -1 : 0}
                      onClick={() => selectCharacter(character.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectCharacter(character.id)
                        }
                      }}
                      className="block w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nv-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nv-surface)]"
                    >
                      <div className="flex h-56 items-center justify-center px-5 pt-6">
                        <CharacterViewer
                          characterId={character.id}
                          size="card"
                          showControls={false}
                          showLabel={false}
                        />
                      </div>

                      <div className="border-t border-[var(--nv-border)] px-5 py-4">
                        <h3 className={`text-lg font-black ${isSelected ? 'text-[var(--nv-primary)]' : 'text-white'}`}>
                          {character.name}
                        </h3>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">
                          {character.gender === 'female' ? 'Female Roster' : 'Male Roster'}
                        </p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {!showConfirm ? (
          <div className="flex items-center justify-between border-t border-[var(--nv-border)] bg-[var(--nv-surface)] px-6 py-4">
            <p className="text-xs text-[var(--nv-muted)]">
              Hover a card to watch each character cycle through their idle and combat animations.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isLoading}
                className="rounded-xl border border-[var(--nv-border)] px-6 py-2.5 text-sm font-medium text-[var(--nv-muted)] transition-colors hover:border-[var(--nv-primary)] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
