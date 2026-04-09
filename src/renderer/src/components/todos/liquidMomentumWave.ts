import { FillGradient, Graphics } from 'pixi.js'

import type { LiquidMomentumFrame } from './liquidMomentumPhysics'

export interface LiquidMomentumWaveSize {
  height: number
  width: number
}

const SURFACE_POINTS = 32

const waveYAt = (
  x: number,
  width: number,
  baseHeight: number,
  amplitude: number,
  offset: number,
  tilt: number
) => {
  const normalizedX = x / width

  // Blending two sine waves gives the crest a softer, less robotic liquid profile.
  const primaryWave = Math.sin(normalizedX * Math.PI * 2 * 1.18 + offset) * amplitude
  const secondaryWave = Math.sin(normalizedX * Math.PI * 2 * 2.06 + offset * 1.34) * amplitude * 0.34
  const inertiaTilt = tilt * (normalizedX - 0.5)

  return baseHeight + primaryWave + secondaryWave + inertiaTilt
}

const traceWaveSurface = (
  graphics: Graphics,
  size: LiquidMomentumWaveSize,
  frame: LiquidMomentumFrame,
  yOffset = 0
) => {
  const { width } = size
  const step = width / SURFACE_POINTS

  for (let index = 0; index <= SURFACE_POINTS; index += 1) {
    const x = Math.min(width, index * step)
    const y = waveYAt(x, width, frame.baseHeight + yOffset, frame.amplitude, frame.offset, frame.tilt)
    graphics.lineTo(x, y)
  }
}

export const createLiquidMomentumWavePainter = () => {
  const liquidGradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 0xffdf86 },
      { offset: 0.42, color: 0xffb33d },
      { offset: 1, color: 0xb34d09 }
    ]
  })

  const glowGradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 0xfff3cf },
      { offset: 1, color: 0xff9b26 }
    ]
  })

  const draw = (graphics: Graphics, size: LiquidMomentumWaveSize, frame: LiquidMomentumFrame) => {
    const { width, height } = size

    graphics.clear()

    graphics
      .moveTo(0, height)
      .lineTo(0, frame.baseHeight)

    traceWaveSurface(graphics, size, frame)

    graphics
      .lineTo(width, height)
      .closePath()
      .fill({ fill: liquidGradient, alpha: 0.97 })

    graphics
      .moveTo(0, waveYAt(0, width, frame.baseHeight - 2, frame.amplitude * 0.92, frame.offset, frame.tilt))

    traceWaveSurface(graphics, size, frame, -2)

    graphics.stroke({
      fill: glowGradient,
      alpha: 0.28 + frame.glowAlpha * 0.12,
      width: 5.5,
      cap: 'round',
      join: 'round'
    })

    graphics
      .moveTo(0, waveYAt(0, width, frame.baseHeight, frame.amplitude, frame.offset, frame.tilt))

    traceWaveSurface(graphics, size, frame)

    graphics.stroke({
      color: 0xfff7de,
      alpha: 0.76,
      width: 1.5,
      cap: 'round',
      join: 'round'
    })
  }

  const destroy = () => {
    liquidGradient.destroy()
    glowGradient.destroy()
  }

  return { destroy, draw }
}
