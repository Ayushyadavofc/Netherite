export interface WindowBoundsSnapshot {
  height: number
  width: number
  x: number
  y: number
}

export interface WindowMovementSample {
  deltaX: number
  deltaY: number
  force: number
  intervalMs: number
  speedX: number
  speedY: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const startWindowBoundsTracking = (
  readBounds: () => Promise<WindowBoundsSnapshot | null>,
  onMovement: (movement: WindowMovementSample) => void,
  intervalMs = 16
) => {
  let disposed = false
  let lastBounds: WindowBoundsSnapshot | null = null
  let lastTimestamp = performance.now()
  let inFlight = false

  const poll = async () => {
    if (disposed || inFlight) {
      return
    }

    inFlight = true

    try {
      const now = performance.now()
      const interval = Math.max(8, now - lastTimestamp)
      lastTimestamp = now
      const nextBounds = await readBounds()

      if (!nextBounds) {
        return
      }

      if (lastBounds) {
        const deltaX = nextBounds.x - lastBounds.x
        const deltaY = nextBounds.y - lastBounds.y
        const distance = Math.hypot(deltaX, deltaY)

        if (distance > 0) {
          onMovement({
            deltaX,
            deltaY,
            force: clamp((distance / interval) * 2.8, 0, 3.8),
            intervalMs: interval,
            speedX: deltaX / interval,
            speedY: deltaY / interval
          })
        }
      }

      lastBounds = nextBounds
    } finally {
      inFlight = false
    }
  }

  const intervalId = window.setInterval(() => {
    void poll()
  }, intervalMs)

  void poll()

  return () => {
    disposed = true
    window.clearInterval(intervalId)
  }
}
