import type { WebcamMetrics } from './types'

export type Landmark = { x: number; y: number; z?: number }
export type FaceMeshResults = {
  multiFaceLandmarks?: Landmark[][]
}

export const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max)
export const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)
export const normalizePoint = (point: Landmark) => ({ x: clamp(point.x), y: clamp(point.y) })
export const averageLandmark = (points: Array<Landmark | undefined>) => {
  const validPoints = points.filter((point): point is Landmark => Boolean(point))
  if (validPoints.length === 0) return null
  return {
    x: validPoints.reduce((sum, point) => sum + point.x, 0) / validPoints.length,
    y: validPoints.reduce((sum, point) => sum + point.y, 0) / validPoints.length
  }
}
export const pickPoints = (landmarks: Landmark[], indices: number[]) =>
  indices.map((index) => normalizePoint(landmarks[index]))

export const EAR_THRESHOLD = 0.25
export const CONSEC_FRAMES = 40
export const PERCLOS_WINDOW_MS = 60_000
export const PERCLOS_THRESHOLD = 0.4
export const HEAD_POSE_YAW_THRESHOLD = 0.08
export const HEAD_POSE_PITCH_THRESHOLD = 0.06
export const YAWN_MOUTH_OPENING_THRESHOLD = 0.12
export const YAWN_SUSTAINED_MS = 1500
export const FATIGUE_RISE_ALPHA = 0.02
export const FATIGUE_FALL_ALPHA = 0.08
export const SMILE_WIDTH_THRESHOLD = 0.45
export const BLINK_THRESHOLD = 0.21
export const MEDIAPIPE_VERSION = '0.4.1633559619'

export const EAR_SMOOTHING_WINDOW_MESH = 3
export const BLINK_RESET_FRAMES_MESH = 180

export const EAR_SMOOTHING_WINDOW_CONTROLLER = 5
export const BLINK_RESET_FRAMES_CONTROLLER = 250

export const LEFT_EYE_EAR = [33, 160, 158, 133, 153, 144]
export const RIGHT_EYE_EAR = [362, 385, 387, 263, 373, 380]
export const LEFT_EYE_OUTLINE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161]
export const RIGHT_EYE_OUTLINE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384]
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
export const MOUTH_CORNER_LEFT = 61
export const MOUTH_CORNER_RIGHT = 291
export const MOUTH_UPPER_LIP = 0
export const MOUTH_LOWER_LIP = 17
export const MOUTH_CENTER_UPPER = 13
export const MOUTH_CENTER_LOWER = 14
export const NOSE_TIP = 1
export const NOSE_TIP_FALLBACK = 4

export const computeEAR = (landmarks: Landmark[], indices: number[]) => {
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index])
  const vertical = distance(p2, p6) + distance(p3, p5)
  const horizontal = 2 * distance(p1, p4)
  if (horizontal === 0) return 0
  return vertical / horizontal
}

export const isSmiling = (landmarks: Landmark[], faceWidth: number) => {
  if (faceWidth <= 0) return false
  const leftCorner = landmarks[MOUTH_CORNER_LEFT]
  const rightCorner = landmarks[MOUTH_CORNER_RIGHT]
  const upperLip = landmarks[MOUTH_UPPER_LIP] ?? landmarks[MOUTH_LOWER_LIP]
  const lowerLip = landmarks[MOUTH_LOWER_LIP] ?? landmarks[MOUTH_UPPER_LIP]
  if (!leftCorner || !rightCorner || !upperLip || !lowerLip) return false
  return distance(leftCorner, rightCorner) / faceWidth >= SMILE_WIDTH_THRESHOLD
}

export const getHeadPose = (
  landmarks: Landmark[],
  faceWidth: number,
  faceHeight: number
): WebcamMetrics['head_pose'] => {
  const noseTip = landmarks[NOSE_TIP] ?? landmarks[NOSE_TIP_FALLBACK]
  const leftEye = averageLandmark([landmarks[33], landmarks[133], landmarks[159], landmarks[145]])
  const rightEye = averageLandmark([landmarks[362], landmarks[263], landmarks[386], landmarks[374]])
  const mouthCenter = averageLandmark([
    landmarks[MOUTH_CENTER_UPPER],
    landmarks[MOUTH_CENTER_LOWER],
    landmarks[MOUTH_UPPER_LIP],
    landmarks[MOUTH_LOWER_LIP]
  ])
  if (!noseTip || !leftEye || !rightEye || !mouthCenter) return 'center'

  const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 }
  const yawOffset = (noseTip.x - eyeMid.x) / Math.max(faceWidth, 1e-4)
  if (yawOffset <= -HEAD_POSE_YAW_THRESHOLD) return 'right'
  if (yawOffset >= HEAD_POSE_YAW_THRESHOLD) return 'left'

  const neutralNoseY = eyeMid.y + (mouthCenter.y - eyeMid.y) * 0.5
  const pitchOffset = (noseTip.y - neutralNoseY) / Math.max(faceHeight, 1e-4)
  if (pitchOffset <= -HEAD_POSE_PITCH_THRESHOLD) return 'up'
  if (pitchOffset >= HEAD_POSE_PITCH_THRESHOLD) return 'down'

  return 'center'
}

export const getMouthOpening = (landmarks: Landmark[], faceHeight: number) => {
  const upperLip = averageLandmark([landmarks[MOUTH_CENTER_UPPER], landmarks[MOUTH_UPPER_LIP]])
  const lowerLip = averageLandmark([landmarks[MOUTH_CENTER_LOWER], landmarks[MOUTH_LOWER_LIP]])
  if (!upperLip || !lowerLip) return 0
  return distance(upperLip, lowerLip) / Math.max(faceHeight, 1e-4)
}
