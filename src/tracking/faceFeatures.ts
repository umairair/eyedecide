import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

const REMOTE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/face_landmarker.task`;

/** Prefer a bundled copy (npm run fetch-model) so it works on bad hackathon Wi-Fi. */
async function resolveModel(): Promise<string> {
  try {
    const r = await fetch(LOCAL_MODEL, { method: "HEAD" });
    const type = r.headers.get("content-type") ?? "";
    if (r.ok && !type.includes("text/html")) return LOCAL_MODEL;
  } catch {
    /* fall through */
  }
  return REMOTE_MODEL;
}

export async function createLandmarker(): Promise<FaceLandmarker> {
  // loaded on demand: the tracker is a third of the app's code, and mouse players never need it
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
  const modelAssetPath = await resolveModel();
  const make = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  try {
    return await make("GPU");
  } catch (err) {
    console.warn("[eyedecide] GPU delegate unavailable, falling back to CPU", err);
    return make("CPU");
  }
}

export interface FaceSample {
  /** layout: `F` in core/layout */
  features: number[];
  /** 0 … 1, how closed the eyes are; iris readings are junk mid-blink */
  blink: number;
  /** eyes and nose fully inside the picture (a sliding laptop can cut the face off) */
  framed: boolean;
}

const DEG = 180 / Math.PI;
/**
 * MediaPipe's pose is mostly "how the face looks", only about a quarter
 * corrected for where it sits in the frame (measured on photos slid around
 * the frame: yaw ≈ appearance − 0.24·offset, pitch ≈ appearance + 0.25·offset).
 * Adding that quarter back gives pure appearance, and appearance is what
 * matters: the screen is bolted to the camera, so a face that looks the same
 * to the camera is pointed at the same spot on the screen, however the
 * laptop bobs around on your lap.
 */
const PERSPECTIVE = 0.25;
const KEY_POINTS = [1, 33, 133, 263, 362, 468, 473];

/**
 * Left/right signals (head turn, both irises, eye-look blendshapes) plus the
 * nuisance signals calibration uses to cancel body and camera motion.
 */
export function extractFeatures(res: FaceLandmarkerResult, aspect = 4 / 3): FaceSample | null {
  const lm = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;

  let yaw: number, pitch: number, roll: number, ax: number, ay: number, dist: number;
  const m = res.facialTransformationMatrixes?.[0]?.data;
  if (m && m.length === 16) {
    // column-major 4×4; camera space is x right, y up, looking down -z
    const D = Math.max(1, -m[14]);
    ax = Math.atan(m[12] / D) * DEG;
    ay = Math.atan(m[13] / D) * DEG;
    yaw = Math.atan2(m[8], m[10]) * DEG + PERSPECTIVE * ax;
    pitch = Math.asin(Math.max(-1, Math.min(1, -m[9]))) * DEG - PERSPECTIVE * ay;
    roll = Math.atan2(m[1], m[5]) * DEG;
    dist = 30 * Math.log(D);
  } else {
    const l = lm[234], r = lm[454], nose = lm[1];
    const width = Math.hypot((r.x - l.x) * aspect, r.y - l.y) || 1e-6;
    yaw = ((nose.x - l.x) / (r.x - l.x || 1e-6) - 0.5) * 90;
    const eyes = (lm[33].y + lm[263].y) / 2;
    pitch = ((nose.y - eyes) / (lm[152].y - eyes || 1e-6) - 0.4) * 90;
    roll = Math.atan2(lm[263].y - lm[33].y, (lm[263].x - lm[33].x) * aspect) * DEG;
    ax = (nose.x - 0.5) * 60;
    ay = (0.5 - nose.y) * 45;
    dist = -30 * Math.log(width);
  }

  /** where landmark `i` projects onto the line from `a` to `b`, in pixel space (0 = midpoint) */
  const along = (i: number, a: number, b: number) => {
    const ex = (lm[b].x - lm[a].x) * aspect, ey = lm[b].y - lm[a].y;
    const px = (lm[i].x - lm[a].x) * aspect, py = lm[i].y - lm[a].y;
    return (px * ex + py * ey) / (ex * ex + ey * ey || 1e-9) - 0.5;
  };

  // A second, independent head-turn reading: where the nose tip sits along the
  // line between the cheeks (2D geometry, no pose solver). Fusion cross-checks
  // it against the 3D pose to catch pose glitches.
  const yaw2 = along(1, 234, 454) * 90;

  // iris position along the line between the eye corners, in pixel space, so
  // a tilted head or camera doesn't leak into it
  let irisR = 0;
  let irisL = 0;
  if (lm.length >= 478) {
    irisR = along(468, 33, 133);
    irisL = along(473, 362, 263);
  }

  let look = 0;
  let lookV = 0;
  let blink = 0;
  const cats = res.faceBlendshapes?.[0]?.categories;
  if (cats) {
    const g = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;
    look = (g("eyeLookInLeft") + g("eyeLookOutRight") - g("eyeLookOutLeft") - g("eyeLookInRight")) / 2;
    lookV = (g("eyeLookDownLeft") + g("eyeLookDownRight") - g("eyeLookUpLeft") - g("eyeLookUpRight")) / 2;
    blink = Math.max(g("eyeBlinkLeft"), g("eyeBlinkRight"));
  }

  const framed = KEY_POINTS.every((i) => lm[i].x > 0.01 && lm[i].x < 0.99 && lm[i].y > 0.01 && lm[i].y < 0.99);
  return { features: [yaw, yaw2, irisR, irisL, look, ax, ay, pitch, roll, dist, lookV], blink, framed };
}
