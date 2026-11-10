import { useEffect, useRef, useState } from "react";
import { buildCalibration, F, MIN_QUALITY, type CalibrationSamples, type Dot } from "../core/calibration";
import { sounds } from "../core/sound";
import { Camera, Icon } from "../ui";
import { useCameraStatus, useSettings } from "../hooks";
import { hub } from "../tracking/InputHub";

type Step = "face" | Dot | "done";

/** how long the face has to sit nicely before we move on */
const FACE_OK_MS = 1200;
/** never trap anyone on the face step: after this, carry on with what we've got */
const FACE_GIVE_UP_MS = 8000;
/** recording starts early; calibration trims the eye movement onto the dot itself */
const SETTLE_MS = 250;
/** long enough per dot that three dots together span a slow, heavy breath */
const CAPTURE_MS = 1400;
const X: Record<Dot, number> = { center: 50, left: 8, right: 92 };
const ALL: Dot[] = ["center", "left", "right"];
/** the browser's own popup usually answers itself (already allowed): only point at it if it lingers */
const ASK_AFTER_MS = 700;

/** after this many failed rounds of dots, offer the mouse */
const HELP_AFTER = 2;

/** a struggling player still gets in: each retry asks a little less */
const qualityFor = (attempt: number) => (attempt < 2 ? MIN_QUALITY : attempt < 4 ? 4.5 : 3.5);

type Fit = "none" | "far" | "close" | "off" | "ok";
const FIT_TEXT: Record<Fit, string> = {
  none: "face the camera",
  far: "closer",
  close: "back",
  off: "center",
  ok: "hold still",
};

/** rough framing check from the face's position and distance (centimetres, as MediaPipe estimates them) */
function fitOf(f: number[] | null): Fit {
  if (!f) return "none";
  const cm = Math.exp(f[F.dist] / 30);
  if (cm > 95) return "far";
  if (cm < 28) return "close";
  if (Math.abs(f[F.ax]) > 16 || Math.abs(f[F.ay]) > 14) return "off";
  return "ok";
}

export function Calibrate({ onDone, onKeys }: { onDone: () => void; onKeys: () => void }) {
  const status = useCameraStatus();
  const { settings } = useSettings();
  const [queue, setQueue] = useState<Dot[]>(ALL);
  const [step, setStep] = useState<Step>("face");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [face, setFace] = useState(false);
  const [fit, setFit] = useState<Fit>("none");
  const [dark, setDark] = useState(false);
  const [asking, setAsking] = useState(false);
  const samples = useRef<CalibrationSamples>({ center: [], left: [], right: [] });
  const done = useRef(onDone);
  done.current = onDone;

  // Getting here means the player chose the camera: ask for it straight away.
  useEffect(() => {
    hub.setCalibration(null);
    if (hub.status === "off") hub.startCamera();
  }, []);

  const waiting = status === "off" || status === "starting";
  useEffect(() => {
    setAsking(false);
    if (!waiting) return;
    const t = window.setTimeout(() => setAsking(true), ASK_AFTER_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  useEffect(() => {
    if (status !== "ready" || step === "done") return;
    let start: number | null = null;
    let okSince: number | null = null;
    let over = false;
    const begun = performance.now();
    setDark(false);

    return hub.subscribe((f) => {
      if (over) return;
      setFace(f.face);

      if (step === "face") {
        const now = fitOf(f.face ? f.features : null);
        setFit(now);
        if (f.t - begun > 4000 && now === "none") setDark(true);
        okSince = now === "ok" ? (okSince ?? f.t) : null;
        const p = okSince === null ? 0 : Math.min(1, (f.t - okSince) / FACE_OK_MS);
        setProgress(p);
        const giveUp = f.face && f.t - begun > FACE_GIVE_UP_MS;
        if (p >= 1 || giveUp) {
          over = true;
          setProgress(0);
          if (settings.sound) sounds.step();
          setStep(queue[0]);
        }
        return;
      }

      if (!f.face || !f.features) {
        start = null;
        samples.current[step] = [];
        setProgress(0);
        return;
      }
      start ??= f.t;
      const elapsed = f.t - start;
      if (elapsed < SETTLE_MS) return;
      if (!f.blink) samples.current[step].push(f.features);
      const p = Math.min(1, (elapsed - SETTLE_MS) / CAPTURE_MS);
      setProgress(p);
      if (p < 1) return;

      over = true;
      setProgress(0);
      if (settings.sound) sounds.step();
      const rest = queue.slice(queue.indexOf(step) + 1);
      if (rest.length) return setStep(rest[0]);

      const res = buildCalibration(samples.current, qualityFor(attempt));
      if (res.ok) {
        hub.setCalibration(res.model);
        if (settings.sound) sounds.correct();
        setStep("done");
        window.setTimeout(() => done.current(), 1000);
        return;
      }
      // quietly redo just the dots that went wrong
      const again = ALL.filter((d) => res.retry.includes(d));
      for (const d of again) samples.current[d] = [];
      setAttempt((a) => a + 1);
      setQueue(again);
      setStep(again[0]);
    });
  }, [status, step, queue, attempt, settings.sound]);

  const keys = (
    <button className="link" onClick={onKeys}>
      use mouse
    </button>
  );

  // 1. the browser asks for the camera
  if (waiting) {
    if (!asking) return <main className="page" />;
    return (
      <main className="page">
        <Icon name="up" className="arrow-up" />
        <h2 className="head">allow camera</h2>
        {keys}
      </main>
    );
  }

  if (status === "error") {
    const blocked = hub.error === "blocked";
    return (
      <main className="page">
        <h2 className="head">{blocked ? "camera blocked" : "no camera"}</h2>
        {blocked ? (
          <ol className="todo">
            <li>click the camera icon in the address bar</li>
            <li>allow</li>
          </ol>
        ) : (
          <p className="note">{hub.error}</p>
        )}
        <button className="btn" onClick={() => (blocked ? location.reload() : hub.startCamera())}>
          try again
        </button>
        {keys}
      </main>
    );
  }

  // 2. framing: a mirror with an oval to put your face in
  if (status !== "ready" || step === "face") {
    const loading = status !== "ready";
    return (
      <main className="page">
        <Steps at={0} />
        <Camera ok={fit === "ok"} oval progress={progress} />
        <h2 className="head">{loading ? "loading" : dark && fit === "none" ? "more light" : FIT_TEXT[fit]}</h2>
        {keys}
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="page">
        <div className="done">
          <Icon name="check" />
        </div>
      </main>
    );
  }

  // 3. the dots
  return (
    <main className="calib">
      <div className="calib__text">
        <Steps at={ALL.indexOf(step) + 1} />
        <h2 className="head">{face ? "look at the dot" : "face the camera"}</h2>
      </div>
      <div className="dot" style={{ left: `${X[step]}%`, "--p": progress } as React.CSSProperties} aria-hidden>
        <span className="ring" />
      </div>
      {/* the dots keep failing: never trap anyone in setup */}
      {attempt >= HELP_AFTER && <div className="calib__help">{keys}</div>}
    </main>
  );
}

/** where you are in setup: face, then three dots */
function Steps({ at }: { at: number }) {
  return (
    <div className="steps" role="img" aria-label={`step ${at + 1} of 4`}>
      {[0, 1, 2, 3].map((k) => (
        <span key={k} className={k < at ? "is-done" : k === at ? "is-on" : ""} />
      ))}
    </div>
  );
}
