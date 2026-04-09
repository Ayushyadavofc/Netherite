import { useEffect, useRef, useState } from 'react'

import { Application, Container, Graphics } from 'pixi.js'

import { cn } from '@/lib/utils'

import {
  addWindowMovementForce,
  createLiquidMomentumPhysicsState,
  setLiquidMomentumTarget,
  stepLiquidMomentumPhysics
} from './liquidMomentumPhysics'
import { createLiquidMomentumWavePainter } from './liquidMomentumWave'
import { startWindowBoundsTracking } from './windowBoundsTracker'

interface MomentumLiquidBarProps {
  className?: string
  statusText?: string
  value: number
}

interface CanvasBounds {
  height: number
  width: number
}

const DEFAULT_BOUNDS: CanvasBounds = {
  width: 88,
  height: 256
}

const clampMomentumValue = (value: number) => Math.min(100, Math.max(0, value))

export function MomentumLiquidBar({
  className,
  statusText = 'Building',
  value
}: MomentumLiquidBarProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const pixiHostRef = useRef<HTMLDivElement | null>(null)
  const boundsRef = useRef<CanvasBounds>(DEFAULT_BOUNDS)
  const physicsStateRef = useRef(createLiquidMomentumPhysicsState(value))
  const displayValueRef = useRef(Math.round(clampMomentumValue(value)))
  const [displayValue, setDisplayValue] = useState(displayValueRef.current)

  useEffect(() => {
    setLiquidMomentumTarget(physicsStateRef.current, clampMomentumValue(value))
  }, [value])

  useEffect(() => {
    const element = shellRef.current

    if (!element) {
      return
    }

    const updateBounds = () => {
      const rect = element.getBoundingClientRect()
      boundsRef.current = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      }
    }

    updateBounds()

    const resizeObserver = new ResizeObserver(updateBounds)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const host = pixiHostRef.current

    if (!host) {
      return
    }

    let resizeObserver: ResizeObserver | null = null
    let stopWindowTracking: (() => void) | null = null
    let app: Application | null = null
    let stageContainer: Container | null = null
    let liquidGraphics: Graphics | null = null
    const wavePainter = createLiquidMomentumWavePainter()
    let destroyed = false

    const initPixi = async () => {
      const nextApp = new Application()
      await nextApp.init({
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
        height: boundsRef.current.height,
        preference: 'webgl',
        resolution: window.devicePixelRatio || 1,
        sharedTicker: false,
        width: boundsRef.current.width
      })

      if (destroyed) {
        nextApp.destroy(true, true)
        return
      }

      nextApp.canvas.style.width = '100%'
      nextApp.canvas.style.height = '100%'
      nextApp.canvas.style.display = 'block'
      host.appendChild(nextApp.canvas)

      const nextContainer = new Container()
      const nextLiquidGraphics = new Graphics()
      nextContainer.addChild(nextLiquidGraphics)
      nextApp.stage.addChild(nextContainer)

      app = nextApp
      stageContainer = nextContainer
      liquidGraphics = nextLiquidGraphics

      resizeObserver = new ResizeObserver(() => {
        if (!app) {
          return
        }

        const width = Math.max(1, Math.round(host.clientWidth))
        const height = Math.max(1, Math.round(host.clientHeight))
        boundsRef.current = { width, height }
        app.renderer.resize(width, height)
      })

      resizeObserver.observe(host)

      stopWindowTracking = startWindowBoundsTracking(
        () => window.electronAPI.getWindowBounds(),
        ({ deltaX, deltaY, force, intervalMs, speedX, speedY }) => {
          const intervalScale = 16 / Math.max(8, intervalMs)
          addWindowMovementForce(
            physicsStateRef.current,
            (deltaX * 0.9 + speedX * 18) * force * intervalScale,
            (deltaY * 0.55 + speedY * 12) * force * intervalScale
          )
        }
      )

      nextApp.ticker.add((ticker) => {
        if (!liquidGraphics || !stageContainer) {
          return
        }

        const bounds = boundsRef.current
        const frame = stepLiquidMomentumPhysics(physicsStateRef.current, ticker.elapsedMS, bounds.height)

        wavePainter.draw(liquidGraphics, bounds, frame)
        stageContainer.alpha = 0.94

        const roundedValue = Math.round(frame.levelRatio * 100)
        if (roundedValue !== displayValueRef.current) {
          displayValueRef.current = roundedValue
          setDisplayValue(roundedValue)
        }
      })
    }

    void initPixi()

    return () => {
      destroyed = true
      stopWindowTracking?.()
      resizeObserver?.disconnect()

      if (app) {
        app.destroy(true, true)
      }

      wavePainter.destroy()

      while (host.firstChild) {
        host.removeChild(host.firstChild)
      }
    }
  }, [])

  return (
    <div
      ref={shellRef}
      className={cn(
        'relative h-64 w-20 overflow-hidden rounded-[36px] border border-white/12 bg-[linear-gradient(180deg,rgba(245,248,255,0.08)_0%,rgba(17,20,28,0.2)_24%,rgba(6,8,12,0.32)_100%)] shadow-[0_18px_38px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[10px]',
        className
      )}
    >
      <div ref={pixiHostRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-[9px] rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.015)_100%)]" />
      <div className="pointer-events-none absolute inset-x-[16%] top-[4%] h-[18%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.02)_72%,transparent_100%)] blur-md" />
      <div className="pointer-events-none absolute inset-y-[8%] left-[17%] w-[18%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.06)_38%,rgba(255,255,255,0.02)_72%,transparent_100%)] opacity-80" />
      <div className="pointer-events-none absolute inset-0 rounded-[36px] border border-white/6" />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-black tracking-[0.08em] text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.55)]">
          {displayValue}%
        </span>
        <span className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.3em] text-[rgba(255,245,225,0.92)]">
          {statusText}
        </span>
      </div>
    </div>
  )
}
