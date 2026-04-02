import { useEffect, useSyncExternalStore } from 'react'

import { faceMeshService } from './faceMeshService'

type UseFaceTrackingOptions = {
  enabled?: boolean
}

export function useFaceTracking(options: UseFaceTrackingOptions = {}) {
  const enabled = options.enabled ?? true

  const snapshot = useSyncExternalStore(
    faceMeshService.subscribe,
    faceMeshService.getSnapshot,
    faceMeshService.getSnapshot
  )

  useEffect(() => {
    if (!enabled) {
      return
    }

    return faceMeshService.acquire()
  }, [enabled])

  return snapshot
}
