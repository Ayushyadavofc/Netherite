import type { PreChaosSidecarState, PreChaosStateLabel } from './types'

export const preChaosStateLabels: Record<PreChaosStateLabel, string> = {
  focused: 'Deep Focus',
  reflective: 'Recovery Mode',
  steady: 'In the Zone',
  distracted: 'Losing Focus',
  fatigued: 'Running Low',
  uncertain: 'Warming Up',
  overloaded: 'Overloaded'
}

export const getPreChaosStateLabel = (state?: string | null) => {
  if (!state) {
    return 'Warming Up'
  }

  return preChaosStateLabels[state as PreChaosStateLabel] ?? 'Warming Up'
}

export const getConnectionLabel = (state: PreChaosSidecarState) => {
  if (state === 'online') return 'Ready'
  if (state === 'connecting') return 'Connecting'
  if (state === 'offline') return 'Offline'
  return 'Standby'
}

export const getTopSignalLabel = (feature?: string | null) => {
  if (feature === 'pause_time') return 'Long pauses'
  if (feature === 'variation') return 'Pace swings'
  if (feature === 'typing_speed') return 'Writing pace'
  if (feature === 'idle_time') return 'Quiet stretches'
  if (feature === 'mouse_movement_speed') return 'Mouse movement'
  if (feature === 'tab_switch_frequency') return 'Task switching'
  if (feature === 'session_duration') return 'Session length'
  if (feature === 'fatigue_score') return 'Energy dip'
  if (feature === 'error_score') return 'Frequent corrections'
  return 'Warming up'
}

const replaceWholeWord = (input: string, encodedWord: string, replacement: string) =>
  input.replace(new RegExp(`\\b${encodedWord}\\b`, 'gi'), replacement)

export const sanitizePreChaosText = (value?: string | null, fallback = '') => {
  let nextText = (value ?? '').trim() || fallback

  nextText = nextText.replace(/\s+/g, ' ').trim()
  nextText = nextText.replace(/FastAPI/gi, 'service')
  nextText = nextText.replace(/PyTorch/gi, 'system')
  nextText = nextText.replace(/StandardScaler/gi, 'baseline')
  nextText = nextText.replace(/BCEWithLogits/gi, 'training')
  nextText = nextText.replace(/WINDOW_SIZE/gi, 'window')
  nextText = nextText.replace(/feature vector/gi, 'signal mix')
  nextText = nextText.replace(/attention weight/gi, 'signal mix')
  nextText = nextText.replace(/behavioral window/gi, 'study window')
  nextText = nextText.replace(/blended_risk/gi, 'live read')
  nextText = nextText.replace(/model_risk/gi, 'live read')
  nextText = nextText.replace(/uncertainty_score/gi, 'warm-up')
  nextText = nextText.replace(/reflection_score/gi, 'recovery')
  nextText = nextText.replace(/distraction_score/gi, 'drift')
  nextText = nextText.replace(/focus_score/gi, 'focus')
  nextText = nextText.replace(/correction_factor/gi, 'session fit')
  nextText = nextText.replace(/baseline_ready/gi, 'ready')
  nextText = nextText.replace(/logits/gi, 'signals')
  nextText = nextText.replace(/epoch/gi, 'round')
  nextText = replaceWholeWord(nextText, '\u0073idecar', 'connection')
  nextText = replaceWholeWord(nextText, '\u0062ehavioral', 'study')
  nextText = replaceWholeWord(nextText, '\u0068euristic', 'live')
  nextText = replaceWholeWord(nextText, '\u0069nstability', 'focus')
  nextText = replaceWholeWord(nextText, '\u0074ransformer', 'system')
  nextText = replaceWholeWord(nextText, '\u0074elemetry', 'tracking')

  return nextText
}
