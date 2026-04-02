import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { BrainCircuit, Camera, CloudOff, Gauge, MessageSquarePlus, Radar, Sparkles } from 'lucide-react'

import { useAuthStore } from '@/stores/authStore'
import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'

const feedbackOptions = [
  { label: 'Focused', value: 'focused' as const },
  { label: 'Thinking', value: 'thinking' as const },
  { label: 'Distracted', value: 'distracted' as const },
  { label: 'Tired', value: 'tired' as const }
]

const pieColors = ['var(--nv-secondary)', 'var(--nv-primary)', 'var(--nv-muted)']
const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--nv-surface-strong)',
    border: '1px solid var(--nv-border)',
    borderRadius: '16px'
  },
  labelStyle: {
    color: 'var(--nv-foreground)',
    fontWeight: 700
  },
  itemStyle: {
    color: 'var(--nv-subtle)'
  }
} as const

const stateLabels: Record<string, string> = {
  focused: 'Focused work',
  reflective: 'Reflective work',
  steady: 'Steady activity',
  distracted: 'Attention drift',
  fatigued: 'Fatigue detected',
  overloaded: 'Overload risk',
  uncertain: 'Mixed signals'
}

export default function AnalyticsPage() {
  const [submitting, setSubmitting] = useState(false)
  const [training, setTraining] = useState(false)
  const [datasetStatus, setDatasetStatus] = useState<null | {
    sample_count: number
    session_count: number
    ready_for_training: boolean
    mode: string
    last_trained_at?: string | null
    dataset_path: string
  }>(null)
  const [selectedFeedback, setSelectedFeedback] = useState<'focused' | 'thinking' | 'distracted' | 'tired'>('focused')
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')
  const prediction = usePreChaosStore((state) => state.currentPrediction)
  const history = usePreChaosStore((state) => state.history)
  const baseline = usePreChaosStore((state) => state.baseline)
  const sidecarState = usePreChaosStore((state) => state.sidecarState)
  const sidecarReason = usePreChaosStore((state) => state.sidecarReason)
  const webcamEnabled = usePreChaosStore((state) => state.webcamEnabled)
  const webcamState = usePreChaosStore((state) => state.webcamState)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const setWebcamOptIn = usePreChaosStore((state) => state.setWebcamOptIn)
  const recentEvents = usePreChaosStore((state) => state.recentEvents)
  const appContext = usePreChaosStore((state) => state.appContext)
  const sessionReplays = usePreChaosStore((state) => state.sessionReplays)
  const latestBehavior = usePreChaosStore((state) => state.behaviorWindow[state.behaviorWindow.length - 1])

  const trendData = useMemo(() => {
    if (history.length === 0) {
      return [{ time: 'Start', risk: 0 }]
    }
    return [
      { time: 'Start', risk: 0 },
      ...history.map((point) => ({
        time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        risk: Math.round(point.risk * 100)
      }))
    ]
  }, [history])

  const distribution = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 }
    history.forEach((point) => {
      counts[point.status] += 1
    })
    return [
      { name: 'Low', value: counts.low },
      { name: 'Medium', value: counts.medium },
      { name: 'High', value: counts.high }
    ]
  }, [history])

  const liveBehavior = useMemo(() => {
    const features = latestBehavior?.features
    return {
      typingSpeed: features?.[0] ?? 0,
      pauseTime: features?.[1] ?? 0,
      idleTime: features?.[4] ?? 0,
      sessionMinutes: features?.[7] ?? 0
    }
  }, [latestBehavior])

  const scoreDescriptors = useMemo(
    () => [
      {
        label: 'Focus',
        value: Math.round((prediction?.focus_score ?? 0) * 100),
        helper: 'steady work and useful progress'
      },
      {
        label: 'Fatigue',
        value: Math.round((prediction?.fatigue_score ?? 0) * 100),
        helper: 'webcam plus slower or tired behavior'
      },
      {
        label: 'Distraction',
        value: Math.round((prediction?.distraction_score ?? 0) * 100),
        helper: 'fragmented switching or messy activity'
      },
      {
        label: 'Reflection',
        value: Math.round((prediction?.reflection_score ?? 0) * 100),
        helper: 'thinking, reading, or recall time'
      },
      {
        label: 'Uncertainty',
        value: Math.round((prediction?.uncertainty_score ?? 0) * 100),
        helper: 'the AI is not fully sure yet'
      }
    ],
    [prediction]
  )

  const normalizedSignals = useMemo(() => {
    const signals = prediction?.dominant_signals ?? []
    const maxScore = Math.max(...signals.map((signal) => signal.score), 0)
    return signals.map((signal) => ({
      ...signal,
      relativePercent: maxScore > 0 ? Math.max(12, Math.round((signal.score / maxScore) * 100)) : 0
    }))
  }, [prediction?.dominant_signals])

  const notesSessionReplays = useMemo(
    () => sessionReplays.filter((session) => session.top_route.startsWith('/notes')),
    [sessionReplays]
  )
  const hasTimelineData = history.length > 0
  const hasDistributionData = distribution.some((segment) => segment.value > 0)

  const signalBadge = (relativePercent: number) => {
    if (relativePercent >= 82) {
      return 'Dominant now'
    }
    if (relativePercent >= 55) {
      return 'Strong support'
    }
    return 'Secondary signal'
  }

  const handleFeedback = async () => {
    if (!prediction) {
      return
    }
    try {
      setSubmitting(true)
      await preChaosBridge.sendFeedback(selectedFeedback, prediction.risk, userId)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const [status, sessions] = await Promise.all([
        preChaosBridge.getDatasetStatus().catch(() => null),
        preChaosBridge.getSessionReplays().catch(() => [])
      ])
      if (!cancelled) {
        if (status) {
          setDatasetStatus(status)
        }
        usePreChaosStore.getState().setSessionReplays(sessions)
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 45_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const handleTrainLive = async () => {
    try {
      setTraining(true)
      await preChaosBridge.trainOnLiveData()
      const [status, sessions] = await Promise.all([
        preChaosBridge.getDatasetStatus(),
        preChaosBridge.getSessionReplays()
      ])
      setDatasetStatus(status)
      usePreChaosStore.getState().setSessionReplays(sessions)
    } finally {
      setTraining(false)
    }
  }

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto overflow-x-hidden bg-[var(--nv-bg)] text-[var(--nv-foreground)] [overflow-anchor:none]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.35em] text-[var(--nv-secondary)]">
              PreChaos Analytics
            </p>
            <h1 className="text-3xl font-black text-[var(--nv-foreground)]">Behavioral instability intelligence</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--nv-muted)]">
              Real-time risk scoring, adaptive feedback, and explainability for productivity decline prediction.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[320px]">
            <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">Mode</p>
              <p className="mt-2 text-lg font-bold text-[var(--nv-foreground)]">
                {prediction?.mode === 'trained' ? 'Adaptive model' : prediction ? 'Live heuristics' : 'Warming up'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">Sidecar</p>
              <p className="mt-2 text-lg font-bold capitalize text-[var(--nv-foreground)]">{sidecarState}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-[var(--nv-secondary)]">Webcam Fatigue Sensing</p>
            <p className="mt-2 text-sm leading-6 text-[var(--nv-foreground)]">
              Turn this on if you want PreChaos to use MediaPipe face tracking for fatigue estimation. It stays fully opt-in, and the live fatigue score only influences Notes prediction windows.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWebcamOptIn(!webcamOptIn)}
            className={`inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-bold transition ${
              webcamOptIn
                ? 'border-[var(--nv-secondary)] bg-[var(--nv-surface)] text-[var(--nv-foreground)]'
                : 'border-[var(--nv-secondary)] bg-[var(--nv-surface-strong)] text-[var(--nv-secondary)] hover:bg-[var(--nv-surface)]'
            }`}
          >
            {webcamOptIn ? 'Disable Webcam' : 'Enable Webcam'}
          </button>
          <button
            type="button"
            onClick={() => {
              void preChaosBridge.openCameraModule()
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-5 py-3 text-sm font-bold text-[var(--nv-foreground)] transition hover:bg-[var(--nv-primary-soft-strong)]"
          >
            <Camera className="h-4 w-4" />
            Open Camera Module
          </button>
        </div>

        {sidecarState === 'offline' && (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--nv-danger)] bg-[var(--nv-danger-soft)] p-4 text-sm text-[var(--nv-foreground)]">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--nv-danger)]" />
            <p>{sidecarReason ?? 'The AI sidecar is offline. The rest of the Electron app remains functional.'}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-[var(--nv-secondary)]" />
              <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Risk Timeline</h2>
            </div>
            {hasTimelineData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="prechaosRisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--nv-primary)" stopOpacity={0.82} />
                        <stop offset="100%" stopColor="var(--nv-primary)" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--nv-border)" vertical={false} />
                    <XAxis dataKey="time" stroke="var(--nv-muted)" />
                    <YAxis stroke="var(--nv-muted)" domain={[0, 100]} />
                    <Tooltip {...tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="risk"
                      stroke="var(--nv-primary)"
                      fill="url(#prechaosRisk)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-center">
                <div>
                  <Gauge className="mx-auto mb-3 h-5 w-5 text-[var(--nv-secondary)]" />
                  <p className="text-sm font-semibold text-[#e5e5e5]">No data yet</p>
                  <p className="mt-1 text-xs text-gray-400">Risk history will appear after the first stable prediction windows.</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[var(--nv-secondary)]" />
              <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Distribution</h2>
            </div>
            {hasDistributionData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="value" outerRadius={96} innerRadius={52} paddingAngle={4}>
                      {distribution.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-center">
                <div>
                  <BrainCircuit className="mx-auto mb-3 h-5 w-5 text-[var(--nv-secondary)]" />
                  <p className="text-sm font-semibold text-[#e5e5e5]">No data yet</p>
                  <p className="mt-1 text-xs text-gray-400">State distribution fills in once the analytics model has collected enough sessions.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr_1fr]">
          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-[var(--nv-secondary)]" />
              <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Explainability</h2>
            </div>
            <div className="space-y-3">
              {(prediction?.insights ?? ['No prediction yet.']).map((insight) => (
                <div key={insight} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4 text-sm leading-6 text-[var(--nv-subtle)]">
                  {insight}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Top Signals</h2>
            <div className="space-y-3">
              {normalizedSignals.length === 0 ? (
                <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4 text-sm text-[var(--nv-subtle)]">
                  Dominant signals will appear after the first stable prediction window.
                </div>
              ) : (
                normalizedSignals.map((signal) => (
                  <div key={signal.feature} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-sm font-bold text-[var(--nv-foreground)]">{signal.feature.replace(/_/g, ' ')}</span>
                        <p className="mt-1 text-[11px] text-[var(--nv-subtle)]">
                          Relative impact: {signal.relativePercent}% compared with the strongest signal in this window.
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--nv-subtle)]">
                        {signalBadge(signal.relativePercent)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--nv-subtle)]">
                      <span className="rounded-full bg-[var(--nv-bg)] px-2 py-1">Raw weight {signal.score.toFixed(2)}</span>
                      {signal.feature === 'session_duration' && (
                        <span className="rounded-full bg-[var(--nv-bg)] px-2 py-1">treated as supporting context</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Radar className="h-4 w-4 text-[var(--nv-secondary)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Mental State</h2>
              </div>
              <div className="space-y-4 text-sm text-[var(--nv-subtle)]">
                <p>
                  State: <span className="font-bold text-[var(--nv-foreground)]">{prediction?.state ? stateLabels[prediction.state] ?? prediction.state : 'Warming up'}</span>
                </p>
                <p>
                  Confidence: <span className="font-bold text-[var(--nv-foreground)]">{Math.round((prediction?.confidence ?? 0) * 100)}%</span>
                </p>
                <div className="space-y-3">
                  {scoreDescriptors.map((score) => (
                    <div key={score.label} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="font-bold text-[var(--nv-foreground)]">{score.label}</span>
                        <span className="font-bold text-[var(--nv-foreground)]">{score.value}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--nv-bg)]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--nv-secondary)] to-[var(--nv-primary)]"
                          style={{ width: `${score.value}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[var(--nv-subtle)]">{score.helper}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">What the AI thinks</p>
                  <p className="mt-2 text-sm text-[var(--nv-foreground)]">
                    {prediction?.state ? stateLabels[prediction.state] ?? prediction.state : 'Warming up'}
                  </p>
                  <p className="mt-2 text-sm text-[var(--nv-subtle)]">{prediction?.context_summary ?? 'No context summary yet.'}</p>
                </div>
                <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Why it said that</p>
                  <p className="mt-2 text-sm text-[var(--nv-subtle)]">
                    {prediction?.page_explanation ?? 'Page-specific explainability will appear as soon as predictions stabilize.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Feedback Loop</h2>
              <div className="space-y-3">
                {feedbackOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedFeedback(option.value)}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${
                      selectedFeedback === option.value
                        ? 'border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] text-[var(--nv-foreground)]'
                        : 'border-[var(--nv-border)] bg-[var(--nv-surface-strong)] text-[var(--nv-subtle)] hover:border-[var(--nv-secondary)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleFeedback}
                disabled={!prediction || submitting}
                className="mt-4 w-full rounded-xl border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--nv-foreground)] transition hover:bg-[var(--nv-primary-soft-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Apply feedback correction'}
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Camera className="h-4 w-4 text-[var(--nv-secondary)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Webcam + Baseline</h2>
              </div>
              <div className="space-y-3 text-sm text-[var(--nv-subtle)]">
                <button
                  type="button"
                  onClick={() => setWebcamOptIn(!webcamOptIn)}
                  className={`w-full rounded-xl border px-4 py-3 text-left font-bold transition ${
                    webcamOptIn
                      ? 'border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] text-[var(--nv-foreground)]'
                      : 'border-[var(--nv-border)] bg-[var(--nv-surface-strong)] text-[var(--nv-subtle)] hover:border-[var(--nv-secondary)]'
                  }`}
                >
                  {webcamOptIn ? 'Disable webcam fatigue sensing' : 'Enable webcam fatigue sensing'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void preChaosBridge.openCameraModule()
                  }}
                  className="w-full rounded-xl border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-3 text-left font-bold text-[var(--nv-foreground)] transition hover:bg-[var(--nv-primary-soft-strong)]"
                >
                  Open camera module
                </button>
                <p>Samples seen: {baseline?.samples_seen ?? 0}</p>
                <p>Webcam opt-in: {webcamOptIn ? 'Enabled' : 'Disabled'}</p>
                <p>Webcam state: {webcamState}</p>
                <p>Live webcam: {webcamEnabled ? 'Streaming' : 'Inactive'}</p>
                <p>Correction buckets: {baseline?.correction_factors.length ?? 0}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--nv-secondary)]" />
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Live Behavior Snapshot</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Typing speed',
                value: Math.min((liveBehavior.typingSpeed / 4) * 100, 100),
                raw: `${liveBehavior.typingSpeed.toFixed(2)} keys/sec`,
                hint: 'higher means more active writing'
              },
              {
                label: 'Pause time',
                value: Math.min((liveBehavior.pauseTime / 2.5) * 100, 100),
                raw: `${liveBehavior.pauseTime.toFixed(2)} sec`,
                hint: 'longer means slower rhythm'
              },
              {
                label: 'Idle load',
                value: Math.min((liveBehavior.idleTime / 60) * 100, 100),
                raw: `${liveBehavior.idleTime.toFixed(1)} sec`,
                hint: 'how quiet the recent window is'
              },
              {
                label: 'Session length',
                value: Math.min((liveBehavior.sessionMinutes / 120) * 100, 100),
                raw: `${liveBehavior.sessionMinutes.toFixed(1)} min`,
                hint: 'scaled across a two-hour window'
              }
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[var(--nv-foreground)]">{metric.label}</span>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">{metric.raw}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--nv-bg)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--nv-secondary)] to-[var(--nv-primary)]"
                    style={{ width: `${metric.value}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--nv-subtle)]">{metric.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--nv-secondary)]" />
              <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Recent Cognitive Events</h2>
            </div>
            <div className="space-y-3">
              {recentEvents.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-gray-400">
                  Recent cognitive events will appear once the collector records focus, route, or fatigue signals.
                </div>
              ) : (
                recentEvents.slice(-10).reverse().map((event) => (
                  <div key={event.id} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-semibold text-gray-200">{event.label}</span>
                      <span className="rounded-full bg-zinc-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-200">
                        {event.importance}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} on {event.route}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[var(--nv-secondary)]" />
              <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Context + Training</h2>
            </div>
              <div className="space-y-2 text-sm text-[var(--nv-subtle)]">
              <p>Page: {appContext.page_name}</p>
              <p>Productive context: {appContext.productive_context ? 'Yes' : 'No'}</p>
              <p>Focused editable: {appContext.focused_editable ? 'Yes' : 'No'}</p>
              <p>Reading mode: {appContext.reading_mode ? 'Yes' : 'No'}</p>
              <p>Recent useful actions: {appContext.recent_meaningful_actions}</p>
              <p>Recent activity density: {appContext.recent_event_density.toFixed(2)}</p>
              <p>Route switches: {appContext.route_switches}</p>
              <p>Route dwell: {Math.round(appContext.route_dwell_seconds)}s</p>
              <p>Notes activity (last min): {appContext.note_activity}</p>
              <p>Note switches (last min): {appContext.note_switches}</p>
              <p>Note saves (last min): {appContext.note_saves}</p>
              <p>Flashcards activity (last min): {appContext.flashcard_activity}</p>
              <p>Flashcard latency: {appContext.flashcard_answer_latency.toFixed(2)}s</p>
              <p>Flashcard successes (last min): {appContext.flashcard_successes}</p>
              <p>Todo activity (last min): {appContext.todo_activity}</p>
              <p>Todo completions (last min): {appContext.todo_completions}</p>
              <p>Habit activity (last min): {appContext.habit_activity}</p>
              <p>Habit check-ins (last min): {appContext.habit_check_ins}</p>
              <p>Progress events (last min): {appContext.progress_events}</p>
              <div className="mt-4 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                <p>Logged app samples: {datasetStatus?.sample_count ?? 0}</p>
                <p>Meaningful sessions saved: {datasetStatus?.session_count ?? 0}</p>
                <p>Ready for training: {datasetStatus?.ready_for_training ? 'Yes' : 'No'}</p>
                <p>Last trained: {datasetStatus?.last_trained_at ?? 'Never'}</p>
                <p>Auto-train target: 1500+ samples across 5+ meaningful sessions</p>
                <button
                  type="button"
                  onClick={handleTrainLive}
                  disabled={!datasetStatus?.ready_for_training || training}
                  className="mt-3 w-full rounded-xl border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--nv-foreground)] transition hover:bg-[var(--nv-primary-soft-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {training ? 'Training on app data...' : 'Train on accumulated app data'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--nv-secondary)]" />
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Recent Sessions</h2>
          </div>
          <p className="mb-4 text-sm leading-6 text-[var(--nv-muted)]">
            These session logs stay focused on note-taking windows, so it is easier to read how writing behavior changed across each saved session.
          </p>
          <div className="space-y-4">
            {notesSessionReplays.length === 0 ? (
              <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                <div>
                  <MessageSquarePlus className="mx-auto mb-3 h-5 w-5 text-[var(--nv-secondary)]" />
                  <p className="text-sm font-semibold text-[#e5e5e5]">No data yet</p>
                  <p className="mt-1 text-xs text-gray-400">Recent note sessions will appear after PreChaos records a few longer writing runs.</p>
                </div>
              </div>
            ) : (
              notesSessionReplays
                .slice()
                .sort((left, right) => right.ended_at - left.ended_at)
                .map((session) => (
                  <div key={session.session_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#e5e5e5]">{session.top_route.replace('/', '') || 'landing'} work session</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-gray-400">
                          {stateLabels[session.state_summary] ?? session.state_summary}
                        </p>
                      </div>
                      <div className="rounded-full bg-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-200">
                        {session.sample_count} samples
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="h-24 overflow-hidden rounded-xl border border-white/10 bg-zinc-800/70 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={session.timeline.map((point) => ({
                              time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                              risk: Math.round(point.risk * 100)
                            }))}
                          >
                            <XAxis dataKey="time" hide />
                            <YAxis hide domain={[0, 100]} />
                            <Area
                              type="monotone"
                              dataKey="risk"
                              stroke="var(--nv-secondary)"
                              fill="var(--nv-secondary-soft)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-800/70">
                        {[
                          {
                            label: 'Ended',
                            value: new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            helper: new Date(session.ended_at).toLocaleDateString()
                          },
                          {
                            label: 'Duration',
                            value: `${Math.round(session.duration_seconds)}s`,
                            helper: `${session.sample_count} prediction points`
                          },
                          {
                            label: 'Avg Risk',
                            value: `${Math.round(session.avg_risk * 100)}%`,
                            helper: `Peak ${Math.round(session.max_risk * 100)}%`
                          }
                        ].map((row) => (
                          <div key={row.label} className="border-b border-white/10 px-4 py-3 last:border-b-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{row.label}</p>
                            <p className="mt-1 text-base font-semibold text-[#e5e5e5]">{row.value}</p>
                            <p className="mt-1 text-xs text-gray-400">{row.helper}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
