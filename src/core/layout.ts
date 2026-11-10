/**
 * The raw feature vector `extractFeatures` produces each frame.
 *
 * Left/right is measured by five sensors in two redundant groups:
 *   head: MediaPipe's 3D pose yaw, and an independent 2D estimate from where
 *         the nose sits between the cheeks
 *   eyes: right iris, left iris, and MediaPipe's eye-look blendshapes
 * The rest are "nuisance" readings (where the head is, how far, how tilted)
 * that calibration uses to cancel body and camera motion.
 */
export const F = {
  yaw: 0, // head turn from the 3D pose (degrees, + = player's left)
  yaw2: 1, // head turn from nose-between-cheeks geometry (degrees, same sign)
  irisR: 2, // right iris along its eye, 0 = middle
  irisL: 3,
  look: 4, // eye-look blendshapes, + = player's right
  ax: 5, // head position in the frame, sideways (degrees off the lens axis)
  ay: 6, // … and up/down
  pitch: 7, // head nod as the camera sees it (degrees, + = down)
  roll: 8, // head/camera tilt (degrees)
  dist: 9, // 30·ln(distance), so 3% closer ≈ 1 unit
  lookV: 10, // eye-look blendshapes, + = down
} as const;

/** how many raw left/right sensors come first */
export const SENSORS = 5;
export const FEATURE_COUNT = 11;
export const HEAD_SENSORS = [F.yaw, F.yaw2];
export const EYE_SENSORS = [F.irisR, F.irisL, F.look];

/** smallest believable per-frame noise for each raw feature, in its own units */
export const FLOOR_RAW = [0.15, 0.3, 0.003, 0.003, 0.01, 0.1, 0.1, 0.15, 0.1, 0.05, 0.01];

/** degrees of gaze per unit of the vertical eye blendshape (rough, only used to spot "looking away") */
export const LOOKV_DEG = 30;
export const vertical = (f: number[]) => f[F.pitch] + LOOKV_DEG * f[F.lookV];
