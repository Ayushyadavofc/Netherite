import { Activity, AlertTriangle, BrainCircuit, Camera, ShieldCheck } from 'lucide-react'

import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'

const statusStyles = {
  low: {
    accent: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    bar: 'from-emerald-400 via-lime-300 to-cyan-300',
    label: 'Stable'
  },
  medium: {
    accent: 'text-amber-300',
    bg: 'bg-amber-500/10',
    bar: 'from-amber-300 via-orange-300 to-yellow-200',
    label: 'Watch'
  },
  high: {
    accent: 'text-rose-300',
    bg: 'bg-rose-500/10',
    bar: 'from-rose-400 via-red-300 to-orange-200',
    label: 'Intervene'
  }
} as const

export function DashboardRiskWidget() {
  const prediction = usePreChaosStore((state) => state.currentPrediction)
  const sidecarState = usePreChaosStore((state) => state.sidecarState)
  const sidecarReason = usePreChaosStore((state) => state.sidecarReason)
  const studyContextActive = usePreChaosStore((state) => state.studyContextActive)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const webcamState = usePreChaosStore((state) => state.webcamState)
  const setWebcamOptIn = usePreChaosStore((state) => state.setWebcamOptIn)

  if (!prediction) {
    return (
      <div className="relative flex max-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nv-surface-strong)]">
            <BrainCircuit className="h-4 w-4 text-[var(--nv-secondary)]" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-foreground)]">PreChaos AI</h3>
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">
            {sidecarState === 'offline' ? 'Offline fallback' : 'Calibrating'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWebcamOptIn(!webcamOptIn)}
          className={`ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] transition ${
            webcamOptIn
              ? 'border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] text-[var(--nv-foreground)]'
              : 'border-[var(--nv-border)] bg-[var(--nv-surface-strong)] text-[var(--nv-subtle)] hover:border-[var(--nv-secondary)] hover:text-[var(--nv-foreground)]'
          }`}
          title="Toggle webcam fatigue sensing"
        >
          <Camera className="h-3.5 w-3.5" />
          {webcamOptIn ? 'Webcam On' : 'Enable Webcam'}
        </button>
      </div>
        <div className="flex flex-1 flex-col justify-end gap-3">
          <div className="h-2 overflow-hidden rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)]">
            <div className="h-full w-[12%] rounded-full bg-gradient-to-r from-[var(--nv-secondary)] to-[var(--nv-primary)]" />
          </div>
          <p className="text-xs leading-5 text-[var(--nv-subtle)]">
            {sidecarState === 'offline'
              ? sidecarReason ?? 'The AI sidecar is offline. Existing app features continue working normally.'
              : 'Collecting a rolling behavior window so the first real-time prediction can be generated.'}
          </p>
        </div>
      </div>
    )
  }

  const style = statusStyles[prediction.status]
  const riskPercent = Math.round(prediction.risk * 100)
  const focusPercent = Math.round(prediction.focus_score * 100)
  const uncertaintyPercent = Math.round(prediction.uncertainty_score * 100)
  const stateLabel =
    prediction.state === 'focused'
      ? 'Focused work'
      : prediction.state === 'reflective'
        ? 'Reflective work'
        : prediction.state === 'steady'
          ? 'Steady activity'
          : prediction.state === 'distracted'
            ? 'Attention drift'
            : prediction.state === 'fatigued'
              ? 'Fatigue detected'
              : prediction.state === 'overloaded'
                ? 'Overload risk'
              : 'Mixed signals'

  if (!studyContextActive) {
    return (
      <div className="relative flex max-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
        <div className="mb-4 flex items-center justify-between gap-3 opacity-60">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.bg}`}>
              <Activity className={`h-4 w-4 ${style.accent}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-foreground)]">PreChaos AI</h3>
              <p className={`text-[0.55rem] font-bold uppercase tracking-[0.25em] ${style.accent}`}>{stateLabel}</p>
            </div>
          </div>
          <p className="text-2xl font-black text-[var(--nv-foreground)]">{riskPercent}%</p>
        </div>
        <div className="rounded-lg border border-dashed border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-4 py-5 text-center">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">Monitoring paused</p>
          <p className="mt-2 text-xs leading-5 text-[var(--nv-subtle)]">
            PreChaos is holding the last study-state snapshot until you return to Notes editing or active flashcard review.
          </p>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3 text-xs text-[var(--nv-subtle)]">
          <div className="flex items-center gap-2">
            <Camera className="h-3.5 w-3.5" />
            <span className="font-bold uppercase tracking-[0.2em]">Webcam</span>
          </div>
          <span className="font-bold text-[var(--nv-foreground)]">{webcamOptIn ? webcamState : 'disabled'}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            void preChaosBridge.openCameraModule()
          }}
          className="mt-3 w-full rounded-lg border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-3 py-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-foreground)] transition hover:border-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)]"
        >
          Open Camera Module
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex max-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.bg}`}>
            <Activity className={`h-4 w-4 ${style.accent}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-foreground)]">PreChaos AI</h3>
            <p className={`text-[0.55rem] font-bold uppercase tracking-[0.25em] ${style.accent}`}>{style.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-[var(--nv-foreground)]">{riskPercent}%</p>
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">
            {stateLabel}
          </p>
        </div>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-500`}
          style={{ width: `${riskPercent}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-1 flex items-center gap-2 text-[var(--nv-subtle)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="font-bold uppercase tracking-[0.2em]">Correction</span>
          </div>
          <p className="text-sm font-bold text-[var(--nv-foreground)]">{prediction.correction_factor.toFixed(2)}x</p>
        </div>
        <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-1 flex items-center gap-2 text-[var(--nv-subtle)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-bold uppercase tracking-[0.2em]">Top Signal</span>
          </div>
          <p className="text-sm font-bold text-[var(--nv-foreground)]">
            {prediction.dominant_signals[0]?.feature?.replace(/_/g, ' ') ?? 'warming up'}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3 text-xs">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Focus Estimate</span>
          <span className="font-bold text-[var(--nv-foreground)]">{focusPercent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--nv-bg)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--nv-secondary)] to-emerald-300"
            style={{ width: `${focusPercent}%` }}
          />
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3 text-xs">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Uncertainty</span>
          <span className="font-bold text-[var(--nv-foreground)]">{uncertaintyPercent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--nv-bg)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-slate-400 to-sky-300"
            style={{ width: `${uncertaintyPercent}%` }}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3 text-xs text-[var(--nv-subtle)]">
        <div className="flex items-center gap-2">
          <Camera className="h-3.5 w-3.5" />
          <span className="font-bold uppercase tracking-[0.2em]">Webcam</span>
        </div>
        <span className="font-bold text-[var(--nv-foreground)]">{webcamOptIn ? webcamState : 'disabled'}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void preChaosBridge.openCameraModule()
        }}
        className="mt-3 w-full rounded-lg border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-3 py-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-foreground)] transition hover:border-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)]"
      >
        Open Camera Module
      </button>
      <p className="mt-4 text-xs leading-5 text-[var(--nv-subtle)]">
        {prediction.page_explanation || prediction.context_summary || prediction.insights[0] || 'Behavior remains stable within the current sliding window.'}
      </p>
    </div>
  )
}
