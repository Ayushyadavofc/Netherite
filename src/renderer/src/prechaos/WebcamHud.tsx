import { useEffect, useRef } from 'react'
import { Camera, Eye, ScanLine, Sparkles, X } from 'lucide-react'

import { usePreChaosStore } from './store'
import { WEBCAM_UNAVAILABLE_MESSAGE } from './webcam-status'

export function WebcamHud() {
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const webcamPreviewVisible = usePreChaosStore((state) => state.webcamPreviewVisible)
  const webcamState = usePreChaosStore((state) => state.webcamState)
  const webcamStream = usePreChaosStore((state) => state.webcamStream)
  const webcamMetrics = usePreChaosStore((state) => state.webcamMetrics)
  const fatigueScore = usePreChaosStore((state) => state.fatigueScore)
  const setWebcamPreviewVisible = usePreChaosStore((state) => state.setWebcamPreviewVisible)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const currentRoute = window.location.hash.replace(/^#/, '') || '/'
  const analyticsMode = currentRoute.startsWith('/analytics')
  const cameraUnavailable = webcamState === 'blocked'

  useEffect(() => {
    if (!videoRef.current) {
      return
    }
    videoRef.current.srcObject = webcamStream
  }, [webcamStream])

  if (!webcamOptIn || !webcamPreviewVisible) {
    return null
  }

  return (
    <div
      className={`pointer-events-none fixed right-4 z-[120] overflow-hidden rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] shadow-[0_20px_48px_rgba(0,0,0,0.35)] backdrop-blur-sm ${
        analyticsMode ? 'top-20 w-[252px]' : 'bottom-5 w-[290px] md:w-[320px]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-4 py-3">
        <div className="flex items-center gap-2 text-[var(--nv-secondary)]">
          <Camera className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.25em]">PreChaos Vision</span>
        </div>
        <button
          type="button"
          onClick={() => setWebcamPreviewVisible(false)}
          className="pointer-events-auto rounded-full p-1 text-[var(--nv-muted)] transition hover:bg-[var(--nv-primary-soft)] hover:text-[var(--nv-foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative aspect-[4/3] bg-[var(--nv-bg)]">
        {!cameraUnavailable && <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover opacity-85" />}
        {cameraUnavailable ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium leading-6 text-[var(--nv-muted)]">
            {WEBCAM_UNAVAILABLE_MESSAGE}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-4 rounded-xl border border-[var(--nv-primary-soft-strong)]" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--nv-primary-soft-strong)]" />
            <div className="absolute left-[20%] top-1/2 h-px w-[60%] bg-[var(--nv-primary-soft-strong)]" />
            <div className="absolute left-1/2 top-[18%] h-[64%] w-px bg-[var(--nv-primary-soft)]" />
            <div className="absolute inset-x-0 top-[36%] border-t border-dashed border-[var(--nv-primary-soft-strong)]" />
            <div className="absolute inset-x-0 top-[62%] border-t border-dashed border-[var(--nv-primary-soft)]" />
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
              <ScanLine className="h-3 w-3" />
              {webcamState}
            </div>
            <div className="absolute right-4 top-4 rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--nv-foreground)]">
              {Math.round(webcamMetrics.confidence * 100)}% lock
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-4 text-[11px] text-[var(--nv-muted)]">
        <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-1 flex items-center gap-2 uppercase tracking-[0.2em] text-[var(--nv-secondary)]">
            <Eye className="h-3.5 w-3.5" />
            Blink
          </div>
          <div className="text-lg font-black text-[var(--nv-foreground)]">{Math.round(webcamMetrics.blink_intensity * 100)}%</div>
        </div>
        <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-1 flex items-center gap-2 uppercase tracking-[0.2em] text-[var(--nv-primary)]">
            <Sparkles className="h-3.5 w-3.5" />
            Fatigue
          </div>
          <div className="text-lg font-black text-[var(--nv-foreground)]">{Math.round(fatigueScore * 100)}%</div>
        </div>
        <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-1 uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Face Presence</div>
          <div className="text-sm font-bold text-[var(--nv-foreground)]">{Math.round(webcamMetrics.face_presence * 100)}%</div>
        </div>
        <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3">
          <div className="mb-1 uppercase tracking-[0.2em] text-[var(--nv-subtle)]">Head Motion</div>
          <div className="text-sm font-bold text-[var(--nv-foreground)]">{Math.round(webcamMetrics.movement * 100)}%</div>
        </div>
      </div>
    </div>
  )
}
