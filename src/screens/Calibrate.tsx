import { useEffect, useRef, useState } from "react";
import { buildCalibration, F, MIN_QUALITY, type CalibrationSamples, type Dot } from "../core/calibration";
import { sounds } from "../core/sound";
import { Camera } from "../ui";
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

/** a struggling player still gets in: each retry asks a little less */
const qualityFor = (attempt: number) => (attempt < 2 ? MIN_QUALITY : attempt < 4 ? 4.5 : 3.5);

type Fit = "none" | "far" | "close" | "off" | "ok";
const FIT_TEXT: Record<Fit, string> = {
  none: "Sit in front of the camera",
  far: "Come a little closer",
  close: "Move back a little",
  off: "Put your face in the oval",
  ok: "Perfect. Hold still",
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
  const [retry, setRetry] = useState(false);
  const [progress, setProgress] = useState(0);
  const [face, setFace] = useState(false);
  const [fit, setFit] = useState<Fit>("none");
  const [slow, setSlow] = useState(false);
  const samples = useRef<CalibrationSamples>({ center: [], left: [], right: [] });
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => hub.setCalibration(null), []);

  // If the camera was allowed before, don't make anyone read the explainer again.
  useEffect(() => {
    if (hub.status !== "off") return;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((p) => {
        if (p.state === "granted") hub.startCamera();
      })
      .catch(() => {});
  }, []);


  useEffect(() => {
    if (status !== "ready" || step === "done") return;
    let start: number | null = null;
    let okSince: number | null = null;
    let over = false;
    const begun = performance.now();
    setSlow(false);

    return hub.subscribe((f) => {
      if (over) return;
      setFace(f.face);

      if (step === "face") {
        const now = fitOf(f.face ? f.features : null);
        setFit(now);
        if (f.t - begun > 4000 && now !== "ok") setSlow(true);
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
        window.setTimeout(() => done.current(), 1300);
        return;
      }
      // quietly redo just the dots that went wrong
      const again = ALL.filter((d) => res.retry.includes(d));
      for (const d of again) samples.current[d] = [];
      setAttempt((a) => a + 1);
      setRetry(true);
      setQueue(again);
      setStep(again[0]);
    });
  }, [status, step, queue, attempt, settings.sound]);

  const keys = (
    <button className="link link--big" onClick={onKeys}>
      Play with the mouse instead
    </button>
  );

  // 1. before the browser's own popup: say what's coming
  if (status === "off") {
    return (
      <main className="center setup">
        <BrowserAsk />
        <h2 className="title1">Your browser will ask to use the camera</h2>
        <p className="lead">
          Click <b className="allow">Allow</b> when it asks.
        </p>
        <button
          className="btn btn--big"
          autoFocus
          onClick={() => {
            hub.startCamera();
          }}
        >
          OK
        </button>
        <p className="fine">🔒 The video stays on this computer. Nothing is recorded or sent.</p>
        {keys}
      </main>
    );
  }

  if (status === "starting") {
    return (
      <main className="center setup">
        <div className="point-up" aria-hidden>
          ↑
        </div>
        <h2 className="title1">
          Click <b className="allow">Allow</b> at the top of the screen
        </h2>
        <p className="lead">Look for the little box near the address bar.</p>
        {keys}
      </main>
    );
  }

  if (status === "error") {
    const blocked = hub.error === "blocked";
    return (
      <main className="center setup">
        <h2 className="title1">{blocked ? "The camera is blocked" : "The camera isn't working"}</h2>
        {blocked ? (
          <ol className="steps">
            <li>
              Click the <b>camera 📷</b> or <b>lock 🔒</b> icon at the top, next to the web address
            </li>
            <li>
              Choose <b className="allow">Allow</b>
            </li>
            <li>Press the button below</li>
          </ol>
        ) : (
          <p className="lead">{hub.error}</p>
        )}
        <button className="btn btn--big" onClick={() => (blocked ? location.reload() : hub.startCamera())}>
          Try again
        </button>
        {keys}
      </main>
    );
  }

  // 2. framing: a live mirror with an oval to put your face in
  if (status !== "ready" || step === "face") {
    const loading = status !== "ready";
    return (
      <main className="center setup">
        <Steps at={0} />
        <Camera ok={fit === "ok"} oval progress={progress} />
        <h2 className={`title1 ${fit === "ok" ? "is-good" : ""}`}>
          {loading ? "Getting ready…" : FIT_TEXT[fit]}
        </h2>
        {!loading && slow && fit === "none" && <p className="lead">Is the room bright enough? Try turning on a light.</p>}
        {!loading && slow && fit !== "none" && fit !== "ok" && <p className="lead">Almost. Starting in a moment…</p>}
        {keys}
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="center setup">
        <div className="bigcheck" aria-hidden>
          ✓
        </div>
        <h2 className="title1 is-good">All set!</h2>
      </main>
    );
  }

  // 3. the dots
  const n = ALL.indexOf(step);
  return (
    <main className="calib">
      <div className="calib__text">
        <Steps at={n + 1} />
        <h2 className="title1">{!face ? "I can't see you. Look at the screen" : retry && step !== "center" ? "Once more. Turn toward the dot" : "Look at the dot"}</h2>
        <p className="lead">Keep looking until the circle fills up</p>
      </div>
      <div className="calib__dot" style={{ left: `${X[step]}%`, "--p": progress } as React.CSSProperties} aria-hidden />
    </main>
  );
}

/** ● ● ○ ○: where you are in setup (face, then three dots) */
function Steps({ at }: { at: number }) {
  return (
    <div className="steps-dots" aria-label={`step ${at + 1} of 4`}>
      {[0, 1, 2, 3].map((k) => (
        <span key={k} className={k < at ? "is-done" : k === at ? "is-on" : ""} />
      ))}
    </div>
  );
}

/** A drawing of the browser's permission popup, so it's familiar when it shows up. */
function BrowserAsk() {
  return (
    <div className="ask" aria-hidden>
      <div className="ask__bar">
        <span />
        <span />
        <span />
        <i>{location.host}</i>
      </div>
      <div className="ask__pop">
        <p>📷 Use your camera?</p>
        <div>
          <em>Block</em>
          <b>Allow</b>
        </div>
      </div>
    </div>
  );
}
