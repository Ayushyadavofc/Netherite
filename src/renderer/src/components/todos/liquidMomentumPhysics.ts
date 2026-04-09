export const LIQUID_DAMPING = 0.9

const IDLE_AMPLITUDE = 2.4
const LEVEL_LERP = 0.05
const MIN_FRAME_SCALE = 0.55
const MAX_FRAME_SCALE = 2.4
const VELOCITY_THRESHOLD = 0.015
const SURFACE_DRIFT = 0.038

export interface LiquidMomentumPhysicsState {
  amplitude: number
  currentLevel: number
  levelOvershoot: number
  offset: number
  targetLevel: number
  velocity: number
}

export interface LiquidMomentumFrame {
  amplitude: number
  baseHeight: number
  glowAlpha: number
  levelRatio: number
  offset: number
  tilt: number
  velocity: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getFrameScale = (deltaMs: number) => clamp(deltaMs / (1000 / 60), MIN_FRAME_SCALE, MAX_FRAME_SCALE)

const toRatio = (value: number) => clamp(value / 100, 0, 1)

export const createLiquidMomentumPhysicsState = (initialValue: number): LiquidMomentumPhysicsState => ({
  amplitude: IDLE_AMPLITUDE,
  currentLevel: 0,
  levelOvershoot: 0,
  offset: 0,
  targetLevel: toRatio(initialValue),
  velocity: 0.18
})

export const setLiquidMomentumTarget = (state: LiquidMomentumPhysicsState, value: number) => {
  state.targetLevel = toRatio(value)
}

export const addWindowMovementForce = (state: LiquidMomentumPhysicsState, deltaX: number, deltaY: number) => {
  const distance = Math.hypot(deltaX, deltaY)

  if (distance < 0.1) {
    return
  }

  const signedDirection = Math.sign(Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY) || 1
  const force = clamp(distance * 0.04, 0, 1.95)

  state.velocity = clamp(state.velocity + signedDirection * force, -6.5, 6.5)
  state.levelOvershoot = clamp(state.levelOvershoot + signedDirection * force * 0.015, -0.1, 0.1)
}

export const stepLiquidMomentumPhysics = (
  state: LiquidMomentumPhysicsState,
  deltaMs: number,
  containerHeight: number
): LiquidMomentumFrame => {
  const frameScale = getFrameScale(deltaMs)

  // Window motion injects velocity, then damping steadily bleeds that energy away.
  state.velocity *= Math.pow(LIQUID_DAMPING, frameScale)
  if (Math.abs(state.velocity) < VELOCITY_THRESHOLD) {
    state.velocity = 0
  }

  const targetAmplitude = clamp(IDLE_AMPLITUDE + Math.abs(state.velocity) * 5.8, IDLE_AMPLITUDE, 20)
  state.amplitude += (targetAmplitude - state.amplitude) * (1 - Math.pow(0.72, frameScale))

  state.levelOvershoot += state.velocity * 0.0046 * frameScale
  state.levelOvershoot *= Math.pow(0.83, frameScale)
  state.levelOvershoot = clamp(state.levelOvershoot, -0.09, 0.09)

  const desiredLevel = clamp(state.targetLevel + state.levelOvershoot, 0, 1.06)
  state.currentLevel += (desiredLevel - state.currentLevel) * (1 - Math.pow(1 - LEVEL_LERP, frameScale))
  state.currentLevel = clamp(state.currentLevel, 0, 1.04)

  state.offset += (SURFACE_DRIFT + state.velocity * 0.17) * frameScale

  const visibleLevel = clamp(state.currentLevel, 0, 1)
  const baseHeight = containerHeight * (1 - visibleLevel)

  return {
    amplitude: state.amplitude,
    baseHeight,
    glowAlpha: clamp(0.2 + Math.abs(state.velocity) * 0.09, 0.2, 0.6),
    levelRatio: visibleLevel,
    offset: state.offset,
    tilt: clamp(state.velocity * 5.6, -16, 16),
    velocity: state.velocity
  }
}
