import { useEffect, useState } from "react";
import { load, save } from "./core/storage";
import type { Mode } from "./data/modes";
import { useCameraStatus, useFaceLost, useRecalNeeded, useTrackingHealth } from "./hooks";
import { Recalibrate, type SetupReason } from "./screens/Recalibrate";
import { hub } from "./tracking/InputHub";
import { Start } from "./screens/Start";
import { Calibrate } from "./screens/Calibrate";
import { Menu } from "./screens/Menu";
import { Game } from "./screens/Game";
import { Over } from "./screens/Over";
import { Practice } from "./screens/Practice";
import { Pause } from "./screens/Pause";
import { About } from "./screens/About";
import { Camera } from "./ui";

type Pick = Mode;

type Screen =
  | { name: "start" }
  | { name: "calibrate" }
  | { name: "practice" }
  | { name: "menu" }
  /** prevBest: the best before this run, so the end can tell a new one */
  | { name: "game"; mode: Pick; run: number; prevBest: number }
  | { name: "over"; mode: Pick; score: number; newBest: boolean };

const idOf = (m: Pick) => m.id;

export function App() {
  const status = useCameraStatus();
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [camera, setCamera] = useState(false);
  const [best, setBest] = useState<Record<string, number>>(() => load("best", {}));
  const [menuIndex, setMenuIndex] = useState(0);
  const [about, setAbout] = useState(false);
  /** setup is showing again over the current screen: the calibration stopped fitting, or the player asked */
  const [recal, setRecal] = useState<SetupReason | null>(null);

  /** eyes held shut mid-game: the hands-free way out */
  const [paused, setPaused] = useState(false);

  const playing = screen.name === "menu" || screen.name === "game" || screen.name === "over" || screen.name === "practice";

  // the setup screen asks for the camera as it opens
  const startCam = () => {
    setCamera(true);
    save("prefs", { ...load("prefs", {}), input: "camera" });
    // switching mid-run keeps the run (a first-timer gets the full setup and its practice instead)
    if (screen.name === "game" && load("prefs", { practiced: false }).practiced) setRecal("asked");
    else setScreen({ name: "calibrate" });
  };
  const calibrated = () => {
    // first time on this device: a short practice before any real question
    if (!load("prefs", { practiced: false }).practiced) setScreen({ name: "practice" });
    else setScreen({ name: "menu" });
  };
  const practiced = () => {
    save("prefs", { ...load("prefs", {}), practiced: true });
    setScreen({ name: "menu" });
  };
  const startKeys = () => {
    setCamera(false);
    save("prefs", { ...load("prefs", {}), input: "keys" });
    hub.stopCamera();
    hub.setCalibration(null);
    setRecal(null);
    // a run in progress carries on with the mouse
    setScreen((s) => (s.name === "game" || s.name === "over" ? s : { name: "menu" }));
  };
  /** set up the camera again without losing your place: over the current screen, which carries on after */
  const resetup = () => (playing ? setRecal("asked") : setScreen({ name: "calibrate" }));

  // load the face model in the background; returning players skip the start screen
  useEffect(() => {
    const { input } = load("prefs", { input: "" });
    // (not for mouse players: it's megabytes of model they'd never use)
    if (input !== "keys") hub.preload();
    if (input !== "camera") return;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((p) => {
        if (p.state === "granted") startCam();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hold your eyes shut for a moment in a game: pause, then look at menu or resume
  const inGame = screen.name === "game";
  useEffect(() => {
    if (!inGame) return setPaused(false);
    if (!camera || paused || recal || about) return;
    return hub.subscribe((f) => {
      if (f.hold) setPaused(true);
    });
  }, [inGame, camera, paused, recal, about]);

  // nothing gets picked while about or a re-setup covers the screen
  useEffect(() => {
    hub.paused = about || recal !== null;
  }, [about, recal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (about) return setAbout(false);
      if (paused) return setPaused(false);
      if ((screen.name === "game" || screen.name === "over" || screen.name === "practice")) setScreen({ name: "menu" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about, screen.name, paused]);

  const lost = useFaceLost(camera && status === "ready" && playing, 800);
  const health = useTrackingHealth(camera && status === "ready" && playing && !recal);
  const needed = useRecalNeeded(camera && status === "ready" && playing && !recal);
  useEffect(() => {
    if (needed) setRecal(needed);
  }, [needed]);

  // the camera died mid-game (unplugged, taken by another app): setup explains and offers a retry or the mouse
  useEffect(() => {
    if (camera && status === "error" && playing) setRecal((r) => r ?? "asked");
  }, [camera, status, playing]);

  // scores count as they're made, so leaving a run early (Esc, the menu, a closed tab) keeps a new best
  useEffect(() => save("best", best), [best]);
  const record = (mode: Pick, score: number) =>
    setBest((b) => (score > (b[idOf(mode)] ?? 0) ? { ...b, [idOf(mode)]: score } : b));

  const finish = (mode: Pick, score: number, prevBest: number) => {
    record(mode, score);
    setScreen({ name: "over", mode, score, newBest: score > prevBest });
  };
  const play = (mode: Pick) => setScreen({ name: "game", mode, run: Date.now(), prevBest: best[idOf(mode)] ?? 0 });

  return (
    <>
      {screen.name === "start" && <Start onPlay={startCam} onAbout={() => setAbout(true)} />}
      {screen.name === "calibrate" && <Calibrate onDone={calibrated} onKeys={startKeys} />}
      {screen.name === "practice" && <Practice onDone={practiced} onRecalibrate={resetup} />}
      {screen.name === "menu" && (
        <Menu
          best={best}
          index={menuIndex}
          onPlay={(mode, i) => {
            setMenuIndex(i);
            play(mode);
          }}
        />
      )}
      {screen.name === "game" && (
        <Game
          key={screen.run}
          mode={screen.mode}
          camera={camera}
          paused={paused}
          best={best[idOf(screen.mode)] ?? 0}
          onScore={(s) => record(screen.mode, s)}
          onOver={(s) => finish(screen.mode, s, screen.prevBest)}
          onRecalibrate={resetup}
        />
      )}
      {screen.name === "over" && (
        <Over
          score={screen.score}
          best={best[idOf(screen.mode)] ?? 0}
          newBest={screen.newBest}
          onMenu={() => setScreen({ name: "menu" })}
          onAgain={() => play(screen.mode)}
        />
      )}

      {paused && !recal && <Pause onMenu={() => setScreen({ name: "menu" })} onResume={() => setPaused(false)} />}

      {recal && (
        <Recalibrate
          reason={recal}
          onDone={() => setRecal(null)}
          onKeys={startKeys}
          onSnooze={() => {
            hub.gaze.snoozeRecal(hub.latest.t);
            setRecal(null);
          }}
        />
      )}

      {lost && !recal && !about && (
        <div className="lost" role="status">
          {/* what the camera sees, so it's obvious how to get back in view */}
          <Camera ok={false} />
          <b className="head">can't see you</b>
        </div>
      )}

      {/* every control there is, in one quiet bar at the bottom middle, where a glance picks nothing */}
      {screen.name !== "start" && (
        <nav className="bar">
          {(screen.name === "game" || screen.name === "over") && <button onClick={() => setScreen({ name: "menu" })}>menu</button>}
          {playing && (
            // with the mouse, this is also how you switch to your eyes
            <button onClick={() => (camera ? resetup() : startCam())}>
              {health && <i className={`light is-${health}`} title={health === "ok" ? "tracking" : "hold still"} />}
              recalibrate
            </button>
          )}
          <button onClick={() => setAbout(true)}>about</button>
        </nav>
      )}

      {about && <About onBack={() => setAbout(false)} />}
    </>
  );
}
