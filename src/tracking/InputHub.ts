import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { CalibrationModel } from "../core/calibration";
import type { Side } from "../core/dwell";
import { GazeProcessor, type Health } from "../core/gaze";
import type { RecalReason } from "../core/watchdog";
import { createLandmarker, extractFeatures, type FaceSample } from "./faceFeatures";

const DROPOUT_HOLD_MS = 250;

export interface InputFrame {
  t: number;
  face: boolean;
  features: number[] | null;
  /** smoothed calibrated signal: ≈-1 left … +1 right; null until calibrated or when no face */
  s: number | null;
  /** eyes closed, face half out of frame, or a held-over frame: don't use `features` for calibration */
  blink: boolean;
  /** looking well off the screen (keyboard, phone) */
  away: boolean;
  /** uncertainty of `s` (one standard deviation) */
  sigma: number;
  health: Health;
  /** set when the calibration no longer fits and a new one is needed */
  recal: RecalReason | null;
  /** eyes held shut on purpose (one frame per closure): pause */
  hold: boolean;
}

const EMPTY = { face: false, features: null, s: null, blink: false, away: false, sigma: 0, health: "ok", recal: null, hold: false } as const;

/** starting: asking for the camera · camera: stream live, model still loading · ready: tracking */
export type CameraStatus = "off" | "starting" | "camera" | "ready" | "error";

type Listener<T> = (v: T) => void;

/**
 * Owns the webcam, the face model and the per-frame loop. Everything else in
 * the app subscribes to frames instead of touching MediaPipe directly.
 */
export class InputHub {
  status: CameraStatus = "off";
  error: string | null = null;
  stream: MediaStream | null = null;
  calibration: CalibrationModel | null = null;
  latest: InputFrame = { t: 0, ...EMPTY };
  /** while true (e.g. settings open) frames still flow but carry no signal, so nothing gets picked */
  paused = false;

  private landmarker: FaceLandmarker | null = null;
  private landmarkerPromise: Promise<FaceLandmarker> | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  /** counts camera starts and stops, so a start can tell it was overtaken */
  private session = 0;
  private lastVideoTime = -1;
  readonly gaze = new GazeProcessor();
  private lastFaceT = -Infinity;
  private frameListeners = new Set<Listener<InputFrame>>();
  private statusListeners = new Set<() => void>();

  setSmoothing(amount: number) {
    // 0 = raw & twitchy, 1 = very smooth & a little laggy
    this.gaze.filter.minCutoff = 3.5 - 3.1 * amount;
  }

  /** Start downloading/compiling the face model in the background so "start" feels instant. */
  preload() {
    this.landmarkerPromise ??= createLandmarker().catch((err) => {
      this.landmarkerPromise = null; // let a later attempt retry
      throw err;
    });
    this.landmarkerPromise.catch(() => {});
    return this.landmarkerPromise;
  }

  async startCamera() {
    if (this.status === "starting" || this.status === "camera" || this.status === "ready") return;
    // Every wait below can outlive this start: the player picks the mouse while
    // the permission popup is up, or while the model loads. A start that was
    // stopped in the meantime must not switch the camera on behind their back.
    const session = ++this.session;
    const stale = () => session !== this.session;
    this.setStatus("starting");
    this.preload();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (stale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      // unplugged, switched off, or taken over by another app
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (this.stream === stream) this.fail("The camera stopped.");
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      // Kept in the DOM (invisible) so every browser keeps decoding frames.
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(video);
      this.video = video;
      await video.play();
      if (stale()) return;
      this.setStatus("camera"); // preview can show while the model finishes loading

      this.landmarker ??= await this.preload();
      if (stale()) return;
      this.setStatus("ready");
      this.loop();
    } catch (err) {
      if (!stale()) this.fail(describeError(err));
    }
  }

  private fail(message: string) {
    this.status = "error"; // set first, so stopCamera doesn't announce "off" on the way
    this.stopCamera();
    this.error = message;
    this.setStatus("error");
  }

  stopCamera() {
    this.session++;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video?.remove();
    this.video = null;
    this.lastVideoTime = -1;
    this.latest = { t: performance.now(), ...EMPTY };
    if (this.status !== "error") this.setStatus("off");
  }

  setCalibration(model: CalibrationModel | null) {
    this.calibration = model;
    this.gaze.setModel(model);
  }

  /**
   * A choice was just made. Feeds the on-the-fly recalibration: `gaze` for a
   * look that filled up, `manual` for a click or key press while the camera is on.
   */
  learn(side: Side, source: "gaze" | "manual") {
    if (this.status !== "ready" || !this.calibration) return;
    if (this.gaze.learn(side, this.latest.t, source)) this.calibration = this.gaze.model;
  }

  subscribe(fn: Listener<InputFrame>) {
    this.frameListeners.add(fn);
    return () => void this.frameListeners.delete(fn);
  }

  onStatus(fn: () => void) {
    this.statusListeners.add(fn);
    return () => void this.statusListeners.delete(fn);
  }

  private setStatus(s: CameraStatus) {
    this.status = s;
    if (s !== "error") this.error = null;
    this.statusListeners.forEach((fn) => fn());
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const video = this.video;
    if (!video || !this.landmarker || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const t = performance.now();
    let sample: FaceSample | null = null;
    try {
      const aspect = video.videoWidth / (video.videoHeight || 1) || 4 / 3;
      sample = extractFeatures(this.landmarker.detectForVideo(video, t), aspect);
    } catch (err) {
      console.error("[eyedecide] detection failed", err);
    }

    if (!sample) {
      // Ride through a few dropped detections instead of flickering to "lost".
      if (t - this.lastFaceT < DROPOUT_HOLD_MS) {
        this.emit({ ...this.latest, t, blink: true, hold: false });
      } else {
        this.gaze.reset();
        this.emit({ t, ...EMPTY });
      }
      return;
    }
    this.lastFaceT = t;
    const g = this.gaze.update({ t, features: sample.features, blink: sample.blink, framed: sample.framed });
    this.emit({
      t,
      face: true,
      features: sample.features,
      s: g.s,
      blink: g.closed,
      away: g.away,
      sigma: g.sigma,
      health: g.health,
      recal: g.recal,
      hold: g.hold,
    });
  };

  private emit(frame: InputFrame) {
    this.latest = frame;
    const out = this.paused ? { ...frame, s: null } : frame;
    this.frameListeners.forEach((fn) => fn(out));
  }
}

function describeError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Plug one in.";
  if (name === "NotReadableError") return "Another app is using it. Close Zoom, FaceTime or Teams.";
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch|network|load/i.test(msg)) return "Check your internet.";
  return msg;
}

export const hub = new InputHub();
