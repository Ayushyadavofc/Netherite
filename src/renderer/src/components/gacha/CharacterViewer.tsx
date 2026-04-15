import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { getAttachmentUrl, normalizePath } from '@/lib/attachments'
import {
  CHARACTER_ANIMATION_DURATIONS,
  getCharacterAnimationLabel,
  getCharacterById,
  resolveCharacterId,
  type CharacterId,
  type CharacterAnimation,
  type CharacterDirection
} from '@/lib/characters'

type CharacterPlaybackState = {
  animation: CharacterAnimation
  direction: CharacterDirection
  isPlaying: boolean
}

interface CharacterViewerProps {
  characterId: string
  size?: 'card' | 'large'
  showControls?: boolean
  showLabel?: boolean
  className?: string
}

const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const CLOCKWISE_DIRECTIONS: CharacterDirection[] = ['down', 'left', 'up', 'right']
const AUTO_SEQUENCE_DURATIONS = {
  walk: [1400, 2200] as const,
  directionHold: 1500
}

const buildCharacterAssetUrl = (folderName: string, fileName: string) => {
  const assetRoot = window.electronAPI.characterAssetRoot
  if (!assetRoot) {
    return ''
  }

  return getAttachmentUrl(normalizePath(`${assetRoot}/${folderName}/${fileName}`))
}

const CHARACTER_SCALE_OVERRIDES: Partial<Record<CharacterId, Partial<Record<CharacterAnimation, number>>>> = {
  swordsman: {
    slash: 1.7,
    backslash: 1.7
  },
  'dark-mage': {
    thrust: 1.55
  },
  'dark-mage-f': {
    thrust: 1.55
  }
}

const normalizeCharacter = (characterId: string) => {
  const character = getCharacterById(characterId)
  return character ?? getCharacterById(resolveCharacterId(characterId, 'male'))
}

export function CharacterViewer({
  characterId,
  size = 'card',
  showControls = false,
  showLabel = false,
  className = ''
}: CharacterViewerProps) {
  const character = useMemo(() => normalizeCharacter(characterId), [characterId])
  const [state, setState] = useState<CharacterPlaybackState>({
    animation: 'walk',
    direction: 'down',
    isPlaying: true
  })
  const [assetFallbackIndex, setAssetFallbackIndex] = useState(0)

  const stateRef = useRef(state)
  const pausedRef = useRef(false)
  const timeoutIdsRef = useRef<Set<number>>(new Set())
  const directionIndexRef = useRef(0)
  const attackIndexRef = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const clearAllTimeouts = () => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    timeoutIdsRef.current.clear()
  }

  const schedule = (callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId)
      callback()
    }, delay)

    timeoutIdsRef.current.add(timeoutId)
  }

  const applyState = (updater: (current: CharacterPlaybackState) => CharacterPlaybackState) => {
    setState((current) => {
      const next = updater(current)
      stateRef.current = next
      return next
    })
  }

  const getCombatAnimations = () =>
    (character?.animations.filter((animation) => !['idle', 'walk', 'hurt'].includes(animation)) ?? []) as CharacterAnimation[]

  const getDirectionIndex = (direction: CharacterDirection) => {
    const index = CLOCKWISE_DIRECTIONS.indexOf(direction)
    return index >= 0 ? index : 0
  }

  const getCurrentDirection = () => {
    return CLOCKWISE_DIRECTIONS[directionIndexRef.current % CLOCKWISE_DIRECTIONS.length] ?? 'down'
  }

  const getNextCombatAnimation = () => {
    const combatAnimations = getCombatAnimations()
    if (combatAnimations.length === 0) {
      return null
    }

    const animation = combatAnimations[attackIndexRef.current % combatAnimations.length] ?? combatAnimations[0]
    attackIndexRef.current = (attackIndexRef.current + 1) % combatAnimations.length
    return animation
  }

  const startAutoSequence = () => {
    if (!character || pausedRef.current) {
      return
    }

    const direction = getCurrentDirection()
    const combatAnimation = getNextCombatAnimation()

    applyState((current) => ({
      ...current,
      animation: 'walk',
      direction,
      isPlaying: true
    }))

    schedule(() => {
      if (pausedRef.current) {
        return
      }

      if (combatAnimation) {
        applyState((current) => ({
          ...current,
          animation: combatAnimation,
          direction,
          isPlaying: true
        }))
      }

      schedule(() => {
        if (pausedRef.current) {
          return
        }

        directionIndexRef.current = (directionIndexRef.current + 1) % CLOCKWISE_DIRECTIONS.length
        startAutoSequence()
      }, combatAnimation ? CHARACTER_ANIMATION_DURATIONS[combatAnimation] : 260)
    }, getRandomInt(AUTO_SEQUENCE_DURATIONS.walk[0], AUTO_SEQUENCE_DURATIONS.walk[1]))
  }

  useEffect(() => {
    pausedRef.current = false
    clearAllTimeouts()
    setAssetFallbackIndex(0)
    directionIndexRef.current = 0
    attackIndexRef.current = 0
    setState({
      animation: 'walk',
      direction: 'down',
      isPlaying: true
    })

    if (character) {
      startAutoSequence()
    }

    return () => {
      pausedRef.current = true
      clearAllTimeouts()
    }
    // character?.id keeps the state machine stable across re-renders while still resetting on swaps.
  }, [character?.id])

  useEffect(() => {
    setAssetFallbackIndex(0)
  }, [character?.id, state.animation, state.direction])

  const handleDirectionChange = (step: 1 | -1) => {
    const currentIndex = getDirectionIndex(stateRef.current.direction)
    const resolvedIndex = (currentIndex + step + CLOCKWISE_DIRECTIONS.length) % CLOCKWISE_DIRECTIONS.length
    const resolvedDirection = CLOCKWISE_DIRECTIONS[resolvedIndex] ?? 'down'

    clearAllTimeouts()
    pausedRef.current = true
    directionIndexRef.current = resolvedIndex

    applyState((current) => ({
      ...current,
      animation: 'walk',
      direction: resolvedDirection,
      isPlaying: false
    }))

    schedule(() => {
      pausedRef.current = false
      startAutoSequence()
    }, AUTO_SEQUENCE_DURATIONS.directionHold)
  }

  const imageCandidates = useMemo(() => {
    if (!character) {
      return []
    }

    const { animation, direction } = state
    const candidates: string[] = []

    if (animation === 'hurt') {
      candidates.push(buildCharacterAssetUrl(character.assetFolder, 'hurt.gif'))
    } else if (animation === 'idle') {
      candidates.push(buildCharacterAssetUrl(character.assetFolder, `idle_${direction}.gif`))
      candidates.push(buildCharacterAssetUrl(character.assetFolder, 'idle.gif'))
    } else {
      candidates.push(buildCharacterAssetUrl(character.assetFolder, `${animation}_${direction}.gif`))
    }

    candidates.push(buildCharacterAssetUrl(character.assetFolder, `walk_${direction}.gif`))
    candidates.push(buildCharacterAssetUrl(character.assetFolder, 'walk_all.gif'))
    candidates.push(buildCharacterAssetUrl(character.assetFolder, 'idle.gif'))
    candidates.push(buildCharacterAssetUrl(character.assetFolder, 'idle_down.gif'))

    return [...new Set(candidates.filter(Boolean))]
  }, [character, state])

  const imageSrc = imageCandidates[Math.min(assetFallbackIndex, Math.max(imageCandidates.length - 1, 0))] ?? ''
  const wrapperSize =
    size === 'large'
      ? showControls
        ? 'h-[132px] w-[110px] sm:h-[144px] sm:w-[118px]'
        : 'h-36 w-36 sm:h-40 sm:w-40'
      : 'h-24 w-24 sm:h-28 sm:w-28'
  const controlButtonSize = size === 'large' ? 'h-8 w-8' : 'h-7 w-7'
  const controlIconSize = size === 'large' ? 16 : 14
  const label = getCharacterAnimationLabel(state.animation)
  const imageScale = character ? CHARACTER_SCALE_OVERRIDES[character.id]?.[state.animation] ?? 1 : 1
  const showcaseFrame = showControls || showLabel

  return (
    <div className={`group relative flex flex-col items-center justify-center ${className}`}>
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-[18px] ${wrapperSize} ${
          showcaseFrame ? 'bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]' : ''
        }`}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={`${character?.name ?? 'Character'} ${state.animation}`}
            className={`h-full w-full object-contain [image-rendering:pixelated] ${
              state.isPlaying ? '' : 'opacity-95'
            }`}
            style={{
              transform: `scale(${imageScale})`,
              transformOrigin: 'center 72%'
            }}
            onError={() => {
              if (assetFallbackIndex < imageCandidates.length - 1) {
                setAssetFallbackIndex((current) => current + 1)
                return
              }

              if (stateRef.current.animation !== 'idle') {
                applyState((current) => ({
                  ...current,
                  animation: 'idle'
                }))
              }
            }}
          />
        ) : null}

      </div>

      {showControls ? (
        <div className="mt-2 flex items-center justify-center gap-3 rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-3 py-1.5 shadow-sm">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleDirectionChange(-1)
            }}
            className={`flex ${controlButtonSize} items-center justify-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/70 hover:text-[var(--nv-primary)]`}
            title="Rotate left"
          >
            <ArrowLeft size={controlIconSize} />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleDirectionChange(1)
            }}
            className={`flex ${controlButtonSize} items-center justify-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/70 hover:text-[var(--nv-primary)]`}
            title="Rotate right"
          >
            <ArrowRight size={controlIconSize} />
          </button>
        </div>
      ) : null}

      {showLabel && !showControls ? (
        <div className="mt-3 rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--nv-primary)] shadow-sm">
          {label}
        </div>
      ) : null}
    </div>
  )
}
