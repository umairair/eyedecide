import { useEffect, useState } from "react";
import { load, save } from "./core/storage";
import { useCameraStatus, useFaceLost, useRecalNeeded } from "./hooks";
import { Recalibrate, type SetupReason } from "./screens/Recalibrate";
import { hub } from "./tracking/InputHub";
import { Start } from "./screens/Start";
import { Calibrate } from "./screens/Calibrate";
import { Game } from "./screens/Game";
import { Over } from "./screens/Over";
import { Practice } from "./screens/Practice";
import { Pause } from "./screens/Pause";
import { About } from "./screens/About";
import { Camera } from "./ui";

type Screen =
  | { name: "start" }
  | { name: "calibrate" }
  | { name: "practice" }
  /** prevBest: the best before this run, so the end can tell a new one */
  | { name: "game"; run: number; prevBest: number }
  | { name: "over"; score: number; newBest: boolean };

/** saved under the name it had when this was one game of several, so a best from then carries over */
const loadBest = () => load("best", { shuffle: 0 }).shuffle;

export function App() {
  const status = useCameraStatus();
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [camera, setCamera] = useState(false);
  const [best, setBest] = useState(loadBest);
  const [about, setAbout] = useState(false);
  /** setup is showing again over the current screen: the calibration stopped fitting, or the player asked */
  const [recal, setRecal] = useState<SetupReason | null>(null);

  /** eyes held shut mid-game: the hands-free way out */
  const [paused, setPaused] = useState(false);

  const playing = screen.name === "game" || screen.name === "over" || screen.name === "practice";
  const play = () => setScreen({ name: "game", run: Date.now(), prevBest: best });

  // the setup screen asks for the camera as it opens
  const startCam = () => {
    setCamera(true);
    save("prefs", { ...load("prefs", {}), input: "camera" });
    setScreen({ name: "calibrate" });
  };
  const calibrated = () => {
    // first time on this device: a short practice before any real question
    if (!load("prefs", { practiced: false }).practiced) setScreen({ name: "practice" });
    else play();
  };
  const practiced = () => {
    save("prefs", { ...load("prefs", {}), practiced: true });
    play();
  };
  const startKeys = () => {
    setCamera(false);
    save("prefs", { ...load("prefs", {}), input: "keys" });
    hub.stopCamera();
    hub.setCalibration(null);
    setRecal(null);
    // a run in progress carries on with the mouse
    if (screen.name !== "game" && screen.name !== "over") play();
  };
  /** set up the camera again without losing your place: over the current screen, which carries on after */
  const resetup = () => setRecal("asked");

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

  // hold your eyes shut for a moment in a game: pause, then look at resume
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about, paused]);

  const lost = useFaceLost(camera && status === "ready" && playing, 800);
  const needed = useRecalNeeded(camera && status === "ready" && playing && !recal);
  useEffect(() => {
    if (needed) setRecal(needed);
  }, [needed]);

  // the camera died mid-game (unplugged, taken by another app): setup explains and offers a retry or the mouse
  useEffect(() => {
    if (camera && status === "error" && playing) setRecal((r) => r ?? "asked");
  }, [camera, status, playing]);

  // scores count as they're made, so leaving a run early (a closed tab) keeps a new best
  useEffect(() => save("best", { shuffle: best }), [best]);
  const record = (score: number) => setBest((b) => Math.max(b, score));

  const finish = (score: number, prevBest: number) => {
    record(score);
    setScreen({ name: "over", score, newBest: score > prevBest });
  };

  return (
    <>
      {screen.name === "start" && <Start onPlay={startCam} onAbout={() => setAbout(true)} />}
      {screen.name === "calibrate" && <Calibrate onDone={calibrated} onKeys={startKeys} />}
      {screen.name === "practice" && <Practice onDone={practiced} onRecalibrate={resetup} />}
      {screen.name === "game" && (
        <Game
          key={screen.run}
          camera={camera}
          paused={paused}
          best={best}
          onScore={record}
          onOver={(s) => finish(s, screen.prevBest)}
          onRecalibrate={resetup}
        />
      )}
      {screen.name === "over" && (
        <Over
          score={screen.score}
          best={best}
          newBest={screen.newBest}
          // with the mouse, this is also how you switch to your eyes
          onRecalibrate={camera ? resetup : startCam}
          onAgain={play}
        />
      )}

      {paused && !recal && <Pause onResume={() => setPaused(false)} />}

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

      {/* the one control off the stage, at the bottom middle, where a glance picks nothing */}
      {screen.name !== "start" && (
        <nav className="bar">
          <button onClick={() => setAbout(true)}>info</button>
        </nav>
      )}

      {about && <About onBack={() => setAbout(false)} />}
    </>
  );
}
