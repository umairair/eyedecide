import { useEffect, useState } from "react";
import { load, save } from "./core/storage";
import type { Mode } from "./data/modes";
import { SettingsDialog } from "./components/SettingsDialog";
import { useCameraStatus, useFaceLost, useRecalNeeded, useSettings, useTrackingHealth } from "./hooks";
import { Recalibrate, type SetupReason } from "./screens/Recalibrate";
import { hub } from "./tracking/InputHub";
import { Start } from "./screens/Start";
import { Calibrate } from "./screens/Calibrate";
import { Menu } from "./screens/Menu";
import { Game } from "./screens/Game";
import { Over } from "./screens/Over";
import { Practice } from "./screens/Practice";
import { Camera, Icon } from "./ui";

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
  const { settings } = useSettings();
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [camera, setCamera] = useState(false);
  const [best, setBest] = useState<Record<string, number>>(() => load("best", {}));
  const [menuIndex, setMenuIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** setup is showing again over the current screen: the calibration stopped fitting, or the player asked */
  const [recal, setRecal] = useState<SetupReason | null>(null);

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

  // nothing gets picked while settings or a re-setup is open
  useEffect(() => {
    hub.paused = settingsOpen || recal !== null;
  }, [settingsOpen, recal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || (e.target as HTMLElement)?.closest?.("input")) return;
      if (e.key.toLowerCase() === "s" && screen.name !== "start") setSettingsOpen(true);
      if (e.key === "Escape" && (screen.name === "game" || screen.name === "over" || screen.name === "practice")) setScreen({ name: "menu" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, screen.name]);

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
      {screen.name === "start" && <Start onCamera={startCam} onKeys={startKeys} />}
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

      {health && !lost && !recal && (
        <span className={`health is-${health}`} role="status" title={health === "ok" ? "Tracking well" : "Tracking is unsure. Picks wait until it is sure."}>
          {health === "ok" ? "" : "Hold still"}
        </span>
      )}
      {screen.name !== "start" && (
        <button className="gear" onClick={() => setSettingsOpen(true)} aria-label="settings" title="Settings (S)">
          <Icon name="gear" />
        </button>
      )}

      {lost && !recal && (
        <div className="lost" role="status">
          {/* what the camera sees, so it's obvious how to get back in view */}
          {settings.preview && <Camera ok={false} />}
          <b className="head">can't see you</b>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        camera={camera}
        onClose={() => setSettingsOpen(false)}
        onRecalibrate={() => {
          setSettingsOpen(false);
          resetup();
        }}
        onPractice={() => {
          setSettingsOpen(false);
          setScreen({ name: "practice" });
        }}
        onSwitchInput={() => {
          setSettingsOpen(false);
          camera ? startKeys() : startCam();
        }}
      />
    </>
  );
}
