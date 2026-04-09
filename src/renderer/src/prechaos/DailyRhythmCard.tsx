import { useEffect, useMemo, useState } from 'react'

import { useAuthStore } from '@/stores/authStore'

import { preChaosBridge } from './bridge'
import type { DailyRhythmSummary } from './types'

const EMPTY_RHYTHM: DailyRhythmSummary = {
  available: false,
  session_count: 0,
  current_hour: new Date().getHours(),
  peak_hour: null,
  hours: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    avg_focus_score: 0,
    sample_count: 0,
    enough_data: false
  }))
}

const normalizeDailyRhythmSummary = (payload: unknown): DailyRhythmSummary => {
  if (!payload || typeof payload !== 'object') {
    return {
      ...EMPTY_RHYTHM,
      current_hour: new Date().getHours()
    }
  }

  const summary = payload as Partial<DailyRhythmSummary>
  const rawHours = Array.isArray(summary.hours) ? summary.hours : []
  const hourMap = new Map(
    rawHours
      .filter((entry): entry is NonNullable<DailyRhythmSummary['hours']>[number] => Boolean(entry && typeof entry === 'object'))
      .map((entry) => [
        Number(entry.hour),
        {
          hour: Number(entry.hour),
          avg_focus_score: Number(entry.avg_focus_score ?? 0),
          sample_count: Number(entry.sample_count ?? 0),
          enough_data: Boolean(entry.enough_data)
        }
      ])
  )

  return {
    available: Boolean(summary.available),
    session_count: Number(summary.session_count ?? 0),
    current_hour: Number.isFinite(Number(summary.current_hour)) ? Number(summary.current_hour) : new Date().getHours(),
    peak_hour:
      summary.peak_hour === null || summary.peak_hour === undefined || !Number.isFinite(Number(summary.peak_hour))
        ? null
        : Number(summary.peak_hour),
    hours: Array.from({ length: 24 }, (_, hour) => {
      const entry = hourMap.get(hour)
      return (
        entry ?? {
          hour,
          avg_focus_score: 0,
          sample_count: 0,
          enough_data: false
        }
      )
    })
  }
}

const formatHour = (hour: number) => {
  const normalized = ((hour % 24) + 24) % 24
  const suffix = normalized >= 12 ? 'PM' : 'AM'
  const twelveHour = normalized % 12 || 12
  return `${twelveHour} ${suffix}`
}

const getHourDistance = (fromHour: number, toHour: number) => {
  const diff = Math.abs(fromHour - toHour)
  return Math.min(diff, 24 - diff)
}

const getPastPeakHours = (currentHour: number, peakHour: number) => (currentHour - peakHour + 24) % 24

const getRhythmMessage = (currentHour: number, peakHour: number | null) => {
  if (peakHour === null) {
    return ''
  }

  if (currentHour === peakHour) {
    return 'This is your sharpest window - use it for your hardest material.'
  }

  if (getHourDistance(currentHour, peakHour) <= 1) {
    return `You're approaching your peak window at ${formatHour(peakHour)}.`
  }

  if (getPastPeakHours(currentHour, peakHour) > 2 && getPastPeakHours(currentHour, peakHour) < 12) {
    return `Your sharpest time today was around ${formatHour(peakHour)}.`
  }

  return `You're usually sharpest around ${formatHour(peakHour)}.`
}

export function DailyRhythmCard() {
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')
  const [summary, setSummary] = useState<DailyRhythmSummary>(EMPTY_RHYTHM)
  const [loaded, setLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)

      try {
        const nextSummary = normalizeDailyRhythmSummary(await preChaosBridge.getDailyRhythm(userId))
        if (!cancelled) {
          setSummary(nextSummary)
          setLoaded(true)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setSummary({
            ...EMPTY_RHYTHM,
            current_hour: new Date().getHours()
          })
          setLoaded(true)
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const shouldShowPlaceholder = !loaded || !summary.available || summary.session_count < 4 || summary.peak_hour === null
  const rhythmMessage = useMemo(
    () => getRhythmMessage(summary.current_hour, summary.peak_hour),
    [summary.current_hour, summary.peak_hour]
  )

  return (
    <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-4">
      {isLoading ? (
        <p className="text-sm leading-6 text-[var(--nv-subtle)]">Loading your daily rhythm...</p>
      ) : shouldShowPlaceholder ? (
        <p className="text-sm leading-6 text-[var(--nv-subtle)]">
          Keep studying - PreChaos is mapping your daily rhythm.
        </p>
      ) : (
        <>
          <div className="mb-3">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-[var(--nv-secondary)]">Your Daily Rhythm</p>
          </div>
          <div
            className="mb-3 grid items-end gap-1"
            style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', height: 80 }}
          >
            {summary.hours.map((entry) => {
              const isCurrentHour = entry.hour === summary.current_hour
              const isPeakHour = entry.hour === summary.peak_hour
              const hasSamples = entry.sample_count > 0
              const barHeight =
                entry.avg_focus_score > 0
                  ? Math.max(6, Math.round(entry.avg_focus_score * 80))
                  : hasSamples
                    ? 6
                    : 2

              const fill = isCurrentHour
                ? 'var(--nv-primary)'
                : isPeakHour
                  ? 'var(--nv-secondary)'
                  : 'var(--nv-muted)'

              return (
                <div key={entry.hour} className="relative flex h-full items-end justify-center">
                  {isPeakHour && (
                    <span
                      className="absolute top-0 h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--nv-secondary)' }}
                    />
                  )}
                  <div
                    className="w-full rounded-t-sm border"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: fill,
                      borderColor: fill,
                      opacity: entry.enough_data ? 1 : 0.2,
                      borderStyle: entry.enough_data ? 'solid' : 'dashed',
                      borderWidth: 1
                    }}
                    title={`${formatHour(entry.hour)}: ${Math.round(entry.avg_focus_score * 100)} focus, ${entry.sample_count} samples`}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-sm leading-6 text-[var(--nv-subtle)]">{rhythmMessage}</p>
        </>
      )}
    </div>
  )
}
