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
import { getConnectionLabel, getPreChaosStateLabel, getTopSignalLabel, sanitizePreChaosText } from './display'
import { usePreChaosStore } from './store'

const feedbackOptions = [
  { label: 'Deep Focus', value: 'focused' as const },
  { label: 'Recovery Time', value: 'thinking' as const },
  { label: 'Losing Focus', value: 'distracted' as const },
  { label: 'Running Low', value: 'tired' as const }
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
  const setBaseline = usePreChaosStore((state) => state.setBaseline)
  const recentEvents = usePreChaosStore((state) => state.recentEvents)
  const appContext = usePreChaosStore((state) => state.appContext)
  const sessionReplays = usePreChaosStore((state) => state.sessionReplays)
  const behaviorWindow = usePreChaosStore((state) => state.behaviorWindow)

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
    const now = Date.now()
    const recentRawEvents = behaviorWindow.filter((entry) => now - entry.timestamp <= 12_000)
    const keyEvents = recentRawEvents.filter((entry) => entry.event.type === 'key_down')
    const routeEvents = recentRawEvents.filter(
      (entry) => entry.event.type === 'route_change' || (entry.event.type === 'visibility_change' && entry.event.hidden)
    )
    const mouseEvents = recentRawEvents.filter((entry) => entry.event.type === 'mouse_move')
    const mouseDistance = mouseEvents.reduce((sum, entry) => {
      const dx = entry.event.dx ?? 0
      const dy = entry.event.dy ?? 0
      return sum + Math.sqrt(dx * dx + dy * dy)
    }, 0)

    const keyTimestamps = keyEvents.map((entry) => entry.timestamp).sort((left, right) => left - right)
    const pauses =
      keyTimestamps.length >= 2
        ? keyTimestamps.slice(1).map((timestamp, index) => (timestamp - keyTimestamps[index]) / 1000)
        : []

    return {
      typingSpeed: keyEvents.length / 12,
      pauseTime: pauses.length > 0 ? pauses.reduce((sum, value) => sum + value, 0) / pauses.length : 0,
      idleTime: Math.max(0, Date.now() - (appContext.last_activity_timestamp || now)) / 1000,
      sessionMinutes: Math.max(0, appContext.route_dwell_seconds / 60),
      mouseDistance,
      routeChanges: routeEvents.length
    }
  }, [appContext.route_dwell_seconds, behaviorWindow])

  const scoreDescriptors = useMemo(
    () => [
      {
        label: 'Focus',
        value: Math.round((prediction?.focus_score ?? 0) * 100),
        helper: 'steady work and useful progress'
      },
      {
        label: 'Energy',
        value: Math.round((prediction?.fatigue_score ?? 0) * 100),
        helper: 'camera and pace cues that suggest tiredness'
      },
      {
        label: 'Drift',
        value: Math.round((prediction?.distraction_score ?? 0) * 100),
        helper: 'fragmented switching or messy activity'
      },
      {
        label: 'Recovery',
        value: Math.round((prediction?.reflection_score ?? 0) * 100),
        helper: 'thinking, reading, or recall time'
      },
      {
        label: 'Warm-up',
        value: Math.round((prediction?.uncertainty_score ?? 0) * 100),
        helper: 'PreChaos is still getting a clean read'
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
  const liveMetrics = [
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
  ]
  const topSignals = normalizedSignals.slice(0, 3)

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
      const [status, baselineData, sessions] = await Promise.all([
        preChaosBridge.getDatasetStatus().catch(() => null),
        preChaosBridge.getBaseline(userId).catch(() => null),
        preChaosBridge.getSessionReplays().catch(() => [])
      ])
      if (!cancelled) {
        if (status) {
          setDatasetStatus(status)
        }
        if (baselineData) {
          setBaseline(baselineData)
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
  }, [setBaseline, userId])

  const handleTrainLive = async () => {
    try {
      setTraining(true)
      await preChaosBridge.trainOnLiveData()
      const [status, baselineData, sessions] = await Promise.all([
        preChaosBridge.getDatasetStatus(),
        preChaosBridge.getBaseline(userId),
        preChaosBridge.getSessionReplays()
      ])
      setDatasetStatus(status)
      setBaseline(baselineData)
      usePreChaosStore.getState().setSessionReplays(sessions)
    } finally {
      setTraining(false)
    }
  }

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto overflow-x-hidden bg-[var(--nv-bg)] text-[var(--nv-foreground)] [overflow-anchor:none]">
      <div className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 rounded-[28px] border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.24)] md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.35em] text-[var(--nv-primary)]">
              PreChaos Analytics
            </p>
            <h1 className="text-4xl font-black text-[var(--nv-foreground)]">Focus and energy insights</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--nv-muted)]">
              A live command surface for study rhythm, distraction pressure, and fatigue signals while you work.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 md:min-w-[520px]">
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">State</p>
              <p className="mt-2 text-lg font-bold text-[var(--nv-foreground)]">{getPreChaosStateLabel(prediction?.state)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">Mode</p>
              <p className="mt-2 text-lg font-bold text-[var(--nv-foreground)]">
                {prediction?.mode === 'trained' ? 'Personalized' : prediction ? 'Live guidance' : 'Warming up'}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">Connection</p>
              <p className="mt-2 text-lg font-bold text-[var(--nv-foreground)]">{getConnectionLabel(sidecarState)}</p>
            </div>
          </div>
        </div>

        {sidecarState === 'offline' && (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--nv-danger)] bg-[var(--nv-danger-soft)] p-4 text-sm text-[var(--nv-foreground)]">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--nv-danger)]" />
            <p>{sanitizePreChaosText(sidecarReason, 'PreChaos is offline right now. The rest of the app still works normally.')}</p>
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
              <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-6 text-center">
                <div>
                  <Gauge className="mx-auto mb-3 h-5 w-5 text-[var(--nv-secondary)]" />
                  <p className="text-sm font-semibold text-[var(--nv-foreground)]">No data yet</p>
                  <p className="mt-1 text-xs text-[var(--nv-muted)]">Your timeline will appear after a few study check-ins.</p>
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
              <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-6 text-center">
                <div>
                  <BrainCircuit className="mx-auto mb-3 h-5 w-5 text-[var(--nv-secondary)]" />
                  <p className="text-sm font-semibold text-[var(--nv-foreground)]">No data yet</p>
                  <p className="mt-1 text-xs text-[var(--nv-muted)]">This view fills in after PreChaos has seen a few more sessions.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--nv-secondary)]" />
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Live Study Snapshot</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {liveMetrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[var(--nv-foreground)]">{metric.label}</span>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">{metric.raw}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--nv-bg)]">
                  <div
                        className="h-full rounded-full bg-[var(--nv-primary)]"
                        style={{ width: `${metric.value}%` }}
                      />
                </div>
                <p className="mt-2 text-xs text-[var(--nv-subtle)]">{metric.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_320px]">
          <div className="space-y-6 xl:row-span-2">
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Radar className="h-4 w-4 text-[var(--nv-secondary)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Study Read</h2>
              </div>
              <div className="space-y-4 text-sm text-[var(--nv-subtle)]">
                <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Current Read</p>
                  <p className="mt-2 text-base font-bold text-[var(--nv-foreground)]">{getPreChaosStateLabel(prediction?.state)}</p>
                  <p className="mt-2 text-sm text-[var(--nv-subtle)]">
                    {sanitizePreChaosText(prediction?.context_summary, 'No context summary yet.')}
                  </p>
                </div>
                <div className="space-y-3">
                  {scoreDescriptors.map((score) => (
                    <div key={score.label} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="font-bold text-[var(--nv-foreground)]">{score.label}</span>
                        <span className="font-bold text-[var(--nv-foreground)]">{score.value}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--nv-bg)]">
                        <div
                          className="h-full rounded-full bg-[var(--nv-primary)]"
                          style={{ width: `${score.value}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[var(--nv-subtle)]">{score.helper}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Why this matters</p>
                  <p className="mt-2 text-sm text-[var(--nv-subtle)]">
                    {sanitizePreChaosText(
                      prediction?.page_explanation,
                      'Page-specific guidance will appear as soon as predictions settle in.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--nv-secondary)]" />
                  <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Recent Study Events</h2>
                </div>
                <div className="space-y-3">
                  {recentEvents.length === 0 ? (
                    <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-5 text-sm text-[var(--nv-muted)]">
                      Recent study events will appear after a few focus, route, or energy updates.
                    </div>
                  ) : (
                    recentEvents.slice(-8).reverse().map((event) => (
                      <div key={event.id} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4 text-sm">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="font-semibold text-[var(--nv-foreground)]">{event.label}</span>
                          <span className="rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--nv-muted)]">
                            {event.importance}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--nv-muted)]">
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
                  <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Study Context + Tuning</h2>
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
                  <div className="mt-4 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                    <p>Logged app samples: {datasetStatus?.sample_count ?? 0}</p>
                    <p>Meaningful sessions saved: {datasetStatus?.session_count ?? 0}</p>
                    <p>Ready for tuning: {datasetStatus?.ready_for_training ? 'Yes' : 'No'}</p>
                    <p>Last refresh: {datasetStatus?.last_trained_at ?? 'Never'}</p>
                    <button
                      type="button"
                      onClick={handleTrainLive}
                      disabled={!datasetStatus?.ready_for_training || training}
                      className="mt-3 w-full rounded-xl border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--nv-foreground)] transition hover:bg-[var(--nv-primary-soft-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {training ? 'Refreshing guidance...' : 'Refresh from saved study data'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 self-start xl:sticky xl:top-6">
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-[var(--nv-secondary)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Guidance</h2>
              </div>
              <div className="space-y-3">
                {(prediction?.insights ?? ['No prediction yet.']).slice(0, 3).map((insight, index) => (
                  <div
                    key={`${insight}-${index}`}
                    className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4 text-sm leading-6 text-[var(--nv-subtle)]"
                  >
                    {insight}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">What Matters Most</h2>
              <div className="space-y-3">
                {topSignals.length === 0 ? (
                  <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4 text-sm text-[var(--nv-subtle)]">
                    This section will fill in after the first few study check-ins.
                  </div>
                ) : (
                  topSignals.map((signal, index) => (
                    <div key={signal.feature} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <span className="text-sm font-bold text-[var(--nv-foreground)]">{getTopSignalLabel(signal.feature)}</span>
                          <p className="mt-1 text-[11px] text-[var(--nv-subtle)]">
                            Strength compared with the biggest influence in this moment: {signal.relativePercent}%.
                          </p>
                        </div>
                        <span className="rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--nv-subtle)]">
                          {index === 0 ? 'Lead signal' : signalBadge(signal.relativePercent)}
                        </span>
                      </div>
                      <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--nv-bg)]">
                        <div
                          className="h-full rounded-full bg-[var(--nv-primary)]"
                          style={{ width: `${signal.relativePercent}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--nv-subtle)]">
                        <span className="rounded-full bg-[var(--nv-bg)] px-2 py-1">Strength {signal.score.toFixed(2)}</span>
                        {signal.feature === 'session_duration' && (
                          <span className="rounded-full bg-[var(--nv-bg)] px-2 py-1">adds extra study context</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
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
                {submitting ? 'Saving...' : 'Send feedback'}
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Camera className="h-4 w-4 text-[var(--nv-secondary)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--nv-foreground)]">Webcam + History</h2>
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
                  {webcamOptIn ? 'Disable webcam energy check' : 'Enable webcam energy check'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void preChaosBridge.openCameraModule()
                  }}
                  className="w-full rounded-xl border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-3 text-left font-bold text-[var(--nv-foreground)] transition hover:bg-[var(--nv-primary-soft-strong)]"
                >
                  Open camera view
                </button>
                <p>Samples seen: {baseline?.samples_seen ?? 0}</p>
                <p>Webcam opt-in: {webcamOptIn ? 'Enabled' : 'Disabled'}</p>
                <p>Webcam state: {webcamState}</p>
                <p>Live webcam: {webcamEnabled ? 'Streaming' : 'Inactive'}</p>
                <p>Daily check-in slots: {baseline?.correction_factors.length ?? 0}</p>
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
            These session logs stay centered on note-taking windows so it is easier to see how your study rhythm changed across each session.
          </p>
          <div className="space-y-4">
            {notesSessionReplays.length === 0 ? (
              <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-6 text-center">
                <div>
                  <MessageSquarePlus className="mx-auto mb-3 h-5 w-5 text-[var(--nv-secondary)]" />
                  <p className="text-sm font-semibold text-[var(--nv-foreground)]">No data yet</p>
                  <p className="mt-1 text-xs text-[var(--nv-muted)]">Recent note sessions will appear after PreChaos records a few longer writing runs.</p>
                </div>
              </div>
            ) : (
              notesSessionReplays
                .slice()
                .sort((left, right) => right.ended_at - left.ended_at)
                .map((session) => (
                  <div key={session.session_id} className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
                    <div className="flex flex-col gap-3 border-b border-[var(--nv-border)] pb-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--nv-foreground)]">{session.top_route.replace('/', '') || 'landing'} work session</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[var(--nv-muted)]">
                          {getPreChaosStateLabel(session.state_summary)}
                        </p>
                      </div>
                      <div className="rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--nv-muted)]">
                        {session.sample_count} samples
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="h-24 overflow-hidden rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-2">
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

                      <div className="overflow-hidden rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)]">
                        {[
                          {
                            label: 'Ended',
                            value: new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            helper: new Date(session.ended_at).toLocaleDateString()
                          },
                          {
                            label: 'Duration',
                            value: `${Math.round(session.duration_seconds)}s`,
                            helper: `${session.sample_count} check-ins`
                          },
                          {
                            label: 'Avg Risk',
                            value: `${Math.round(session.avg_risk * 100)}%`,
                            helper: `Peak ${Math.round(session.max_risk * 100)}%`
                          }
                        ].map((row) => (
                          <div key={row.label} className="border-b border-[var(--nv-border)] px-4 py-3 last:border-b-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--nv-muted)]">{row.label}</p>
                            <p className="mt-1 text-base font-semibold text-[var(--nv-foreground)]">{row.value}</p>
                            <p className="mt-1 text-xs text-[var(--nv-muted)]">{row.helper}</p>
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
