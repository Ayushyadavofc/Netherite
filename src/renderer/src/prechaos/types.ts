export const PRECHAOS_WINDOW_SIZE = 30
export const PRECHAOS_EVENT_BUFFER_SIZE = 240

export const PRECHAOS_FEATURE_NAMES = [
  'typing_speed',
  'pause_time',
  'variation',
  'error_score',
  'idle_time',
  'mouse_movement_speed',
  'tab_switch_frequency',
  'session_duration',
  'fatigue_score'
] as const

export type PreChaosFeatureName = (typeof PRECHAOS_FEATURE_NAMES)[number]

export type PreChaosFeatureVector = number[]

export type PreChaosRawEventType =
  | 'key_down'
  | 'mouse_move'
  | 'route_change'
  | 'visibility_change'
  | 'focus'
  | 'scroll'
  | 'study_action'
  | 'webcam_signal'

export type PreChaosRawEvent = {
  timestamp: number
  type: PreChaosRawEventType
  key_class?: 'character' | 'backspace' | 'delete' | 'enter' | 'modifier' | 'navigation' | 'other'
  route?: string
  action?: string
  hidden?: boolean
  dx?: number
  dy?: number
  fatigue_score?: number
  confidence?: number
}

export type PreChaosFeedbackLabel = 'focused' | 'thinking' | 'distracted' | 'tired'

export type PreChaosStatus = 'low' | 'medium' | 'high'
export type PreChaosStateLabel =
  | 'focused'
  | 'reflective'
  | 'steady'
  | 'distracted'
  | 'fatigued'
  | 'overloaded'
  | 'uncertain'

export type WebcamState = 'disabled' | 'requesting' | 'active' | 'blocked'
export type WebcamPoint = {
  x: number
  y: number
}
export type WebcamBox = {
  x: number
  y: number
  width: number
  height: number
}
export type WebcamMetrics = {
  face_presence: number
  blink_intensity: number
  movement: number
  lighting: number
  confidence: number
  preview_frame?: string
  left_eye_blink: number
  right_eye_blink: number
  face_landmarks: WebcamPoint[]
  face_outline: WebcamPoint[]
  left_eye_outline: WebcamPoint[]
  right_eye_outline: WebcamPoint[]
  ear: number
  left_ear: number
  right_ear: number
  blink_count: number
  low_light: boolean
  face_detected: boolean
  head_pose: 'center' | 'left' | 'right' | 'up' | 'down'
  perclos: number
  yawn_detected: boolean
  fatigue_status: 'Alert' | 'Drowsy' | 'No face'
  webcam_risk: number
  webcam_state: 'Stable' | 'Watch' | 'Elevated' | 'No face'
  notes_risk: number
  notes_state: 'Stable' | 'Reflective' | 'Strained' | 'Elevated' | 'No notes'
  face_box: WebcamBox | null
}

export type PreChaosSidecarState = 'idle' | 'connecting' | 'online' | 'offline'
export type CameraModuleMode = 'stopwatch' | 'stats' | 'expanded'
export type CameraModuleDataPulse = {
  lastSavedAt: number
  magnitude: number
  label: string
}

export type BehaviorEvent = {
  id: string
  timestamp: number
  event: PreChaosRawEvent
  isStudyContext: boolean
  writeToDataset: boolean
}

export type PreChaosContext = {
  route: string
  page_name: 'landing' | 'notes' | 'flashcards' | 'todos' | 'habits' | 'analytics' | 'other'
  productive_context: boolean
  focused_editable: boolean
  recent_meaningful_actions: number
  recent_event_density: number
  route_switches: number
  route_dwell_seconds: number
  note_activity: number
  note_switches: number
  note_saves: number
  typing_speed: number
  pause_time: number
  typing_variation: number
  backspace_count: number
  flashcard_activity: number
  flashcard_answer_latency: number
  flashcard_successes: number
  todo_activity: number
  todo_completions: number
  habit_activity: number
  habit_check_ins: number
  progress_events: number
  reading_mode: boolean
  webcam_opt_in: boolean
  last_activity_timestamp: number
}

export type PreChaosEvent = {
  id: string
  timestamp: number
  collectible: boolean
  type:
    | 'route'
    | 'typing'
    | 'click'
    | 'focus'
    | 'scroll'
    | 'flashcard'
    | 'todo'
    | 'notes'
    | 'habit'
    | 'idle'
    | 'webcam'
  label: string
  route: string
  importance: 'low' | 'medium' | 'high'
}

export type MentalScores = {
  focus: number
  fatigue: number
  distraction: number
  reflection: number
  uncertainty: number
}

export type PreChaosPrediction = {
  risk: number
  status: PreChaosStatus
  state: PreChaosStateLabel
  confidence: number
  confidence_score: number
  authority_label: string
  focus_score: number
  fatigue_score: number
  distraction_score: number
  reflection_score: number
  uncertainty_score: number
  insights: string[]
  dominant_signals: Array<{ feature: string; score: number }>
  attention: number[]
  model_risk: number
  correction_factor: number
  baseline_ready: boolean
  mode: string
  context_summary: string
  page_explanation: string
  requestId?: string
}

export type PreChaosBaseline = {
  user_id: string
  samples_seen: number
  feature_names: string[]
  baseline: {
    mean: number[]
    std: number[]
  }
  correction_factors: number[]
  mode: string
}

export type PreChaosDatasetStatus = {
  sample_count: number
  session_count: number
  ready_for_training: boolean
  mode: string
  last_trained_at?: string | null
  dataset_path: string
}

export type PredictionHistoryPoint = {
  timestamp: number
  risk: number
  status: PreChaosStatus
  state: PreChaosStateLabel
  confidence: number
  focus_score: number
  fatigue_score: number
  distraction_score: number
  reflection_score: number
  uncertainty_score: number
  route: string
}

export type SessionReplayPoint = {
  timestamp: number
  risk: number
  state: PreChaosStateLabel
  route: string
}

export type SessionReplay = {
  session_id: string
  user_id: string
  started_at: number
  ended_at: number
  duration_seconds: number
  sample_count: number
  avg_risk: number
  max_risk: number
  top_route: string
  state_summary: string
  timeline: SessionReplayPoint[]
}

export type DailyRhythmHour = {
  hour: number
  avg_focus_score: number
  sample_count: number
  enough_data: boolean
}

export type DailyRhythmSummary = {
  available: boolean
  session_count: number
  current_hour: number
  peak_hour: number | null
  hours: DailyRhythmHour[]
}

export type PomodoroPhase = 'idle' | 'studying' | 'break'

export type PomodoroSnapshot = {
  phase: PomodoroPhase
  remainingMs: number
  studyDurationMs: number
  breakDurationMs: number
  isRunning: boolean
  blockExtended: boolean
  studyBlockStartedAt: number | null
  targetEndTime: number | null
}

export type PomodoroAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'skipBreak' }
  | { type: 'takeBreak'; extraBreakMs?: number }

export type CameraModuleSnapshot = {
  windowOpen: boolean
  mode: CameraModuleMode
  webcamEnabled: boolean
  webcamOptIn: boolean
  webcamState: WebcamState
  webcamMetrics: WebcamMetrics
  fatigueScore: number
  sidecarState: PreChaosSidecarState
  prediction: {
    risk: number
    state: PreChaosStateLabel
    confidence: number
  } | null
  dataPulse: CameraModuleDataPulse
  pomodoro: PomodoroSnapshot | null
  pomodoroAction?: PomodoroAction | null
  updatedAt: number
}
