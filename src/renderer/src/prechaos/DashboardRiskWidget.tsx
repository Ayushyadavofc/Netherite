import { Activity, AlertTriangle, BrainCircuit, Camera, ShieldCheck } from 'lucide-react'

import { preChaosBridge } from './bridge'
import { getPreChaosStateLabel, getTopSignalLabel, sanitizePreChaosText } from './display'
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
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const webcamState = usePreChaosStore((state) => state.webcamState)
  const setWebcamOptIn = usePreChaosStore((state) => state.setWebcamOptIn)
  const stateLabel = getPreChaosStateLabel(prediction?.state)

  if (!prediction) {
    return (
      <div className="relative flex h-full min-h-[332px] flex-col overflow-hidden rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--nv-surface-strong)]">
              <BrainCircuit className="h-4 w-4 text-[var(--nv-secondary)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-foreground)]">PreChaos AI</h3>
              <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">
                {sidecarState === 'offline' ? 'Offline fallback' : 'Calibrating'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWebcamOptIn(!webcamOptIn)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.6rem] font-bold uppercase tracking-[0.18em] transition ${
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

        <div className="flex flex-1 flex-col gap-4">
          <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
            <div className="h-2 overflow-hidden rounded-full border border-[var(--nv-border)] bg-[var(--nv-bg)]">
              <div className="h-full w-[12%] rounded-full bg-gradient-to-r from-[var(--nv-secondary)] to-[var(--nv-primary)]" />
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--nv-subtle)]">
              {sidecarState === 'offline'
                ? sanitizePreChaosText(sidecarReason, 'PreChaos is offline right now. Existing app features continue working normally.')
                : 'Getting your first live read ready.'}
            </p>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-3 text-[0.65rem]">
            <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
              <p className="font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Webcam</p>
              <p className="mt-2 text-sm font-semibold text-[var(--nv-foreground)]">{webcamOptIn ? 'Enabled' : 'Disabled'}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void preChaosBridge.openCameraModule()
              }}
              className="rounded-lg border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-3 py-3 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-foreground)] transition hover:border-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)]"
            >
              Open Camera Module
            </button>
          </div>
        </div>
      </div>
    )
  }

  const style = statusStyles[prediction.status]
  const riskPercent = Math.round(prediction.risk * 100)
  const focusPercent = Math.round(prediction.focus_score * 100)
  const uncertaintyPercent = Math.round(prediction.uncertainty_score * 100)
  const confidenceBarWidth = Math.max(8, Math.round((prediction.confidence_score ?? 0.3) * 120))

  return (
    <div className="relative flex h-full min-h-[332px] flex-col overflow-hidden rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${style.bg}`}>
            <Activity className={`h-4 w-4 ${style.accent}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-foreground)]">PreChaos AI</h3>
            <p className={`text-[0.55rem] font-bold uppercase tracking-[0.25em] ${style.accent}`}>{style.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-[var(--nv-subtle)]">{style.label}</p>
          <p className="text-base font-black text-[var(--nv-foreground)]">{riskPercent}% risk</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
        <p className="text-lg font-black leading-tight text-[var(--nv-foreground)]">{stateLabel}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--nv-foreground)]">
          {prediction.insights[0] || "Keep going - PreChaos is still calibrating to you."}
        </p>
        <p className="mt-2 text-[11px] italic text-[var(--nv-subtle)]">{prediction.authority_label}</p>
        <div className="mt-3 w-[120px] max-w-full overflow-hidden rounded-full bg-[var(--nv-bg)]">
          <div
            className={`h-[3px] rounded-full bg-gradient-to-r ${style.bar} transition-all duration-500`}
            style={{ width: `${confidenceBarWidth}px`, maxWidth: '120px' }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[0.65rem]">
        <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-2 flex items-center gap-2 text-[var(--nv-subtle)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="font-bold uppercase tracking-[0.2em]">Session Fit</span>
          </div>
          <p className="text-sm font-bold text-[var(--nv-foreground)]">{prediction.correction_factor.toFixed(2)}x</p>
        </div>

        <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-2 flex items-center gap-2 text-[var(--nv-subtle)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-bold uppercase tracking-[0.2em]">Biggest Pull</span>
          </div>
          <p className="text-sm font-bold leading-5 text-[var(--nv-foreground)]">
            {getTopSignalLabel(prediction.dominant_signals[0]?.feature)}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Focus</span>
            <span className="font-bold text-[var(--nv-foreground)]">{focusPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--nv-bg)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--nv-secondary)] to-emerald-300"
              style={{ width: `${focusPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-bold uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Warm-up</span>
            <span className="font-bold text-[var(--nv-foreground)]">{uncertaintyPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--nv-bg)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-slate-400 to-sky-300"
              style={{ width: `${uncertaintyPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-[0.65rem]">
        <div className="flex items-center justify-between rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3 text-[var(--nv-subtle)]">
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
          className="rounded-lg border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-3 py-3 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[var(--nv-foreground)] transition hover:border-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)]"
        >
          Camera
        </button>
      </div>
    </div>
  )
}
