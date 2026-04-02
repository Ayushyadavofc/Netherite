import { useEffect, useRef } from 'react'

import { useFaceTracking } from './useFaceTracking'

export function FaceTrackingExample() {
  const { stream, webcamState, fatigueScore, metrics, error } = useFaceTracking({ enabled: true })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!videoRef.current) {
      return
    }

    videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[var(--nv-muted)]">State</div>
          <div className="font-semibold text-[var(--nv-foreground)]">{webcamState}</div>
        </div>
        <div>
          <div className="text-[var(--nv-muted)]">Fatigue</div>
          <div className="font-semibold text-[var(--nv-foreground)]">{Math.round(fatigueScore * 100)}%</div>
        </div>
        <div>
          <div className="text-[var(--nv-muted)]">Confidence</div>
          <div className="font-semibold text-[var(--nv-foreground)]">{Math.round(metrics.confidence * 100)}%</div>
        </div>
        <div>
          <div className="text-[var(--nv-muted)]">Blinks</div>
          <div className="font-semibold text-[var(--nv-foreground)]">{metrics.blink_count}</div>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--nv-primary)]">{error}</p> : null}
    </div>
  )
}
