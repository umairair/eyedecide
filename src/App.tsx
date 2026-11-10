import { useEffect, useState } from "react";
import { load, save } from "./core/storage";
import type { Mode } from "./data/modes";
import { SettingsDialog } from "./components/SettingsDialog";
import { useCameraStatus, useFaceLost, useRecalNeeded, useTrackingHealth } from "./hooks";
import type { RecalReason } from "./core/watchdog";
import { Recalibrate } from "./screens/Recalibrate";
import { hub } from "./tracking/InputHub";
import { Start } from "./screens/Start";
import { Calibrate } from "./screens/Calibrate";
import { Menu } from "./screens/Menu";
import { Game } from "./screens/Game";
import { Over } from "./screens/Over";
import { Practice } from "./screens/Practice";

type Pick = Mode;

type Screen =
  | { name: "start" }
  | { name: "calibrate" }
  | { name: "practice" }
  | { name: "menu" }
  | { name: "game"; mode: Pick; run: number }
  | { name: "over"; mode: Pick; score: number; newBest: boolean };

const idOf = (m: Pick) => m.id;

export function App() {
  const status = useCameraStatus();
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [camera, setCamera] = useState(false);
  const [best, setBest] = useState<Record<string, number>>(() => load("best", {}));
  const [menuIndex, setMenuIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** the calibration stopped fitting: a re-setup is showing over the current screen */
  const [recal, setRecal] = useState<RecalReason | null>(null);

  // the setup screen explains the browser's camera popup before asking for it
  const startCam = () => {
    setCamera(true);
    save("prefs", { ...load("prefs", {}), input: "camera" });
    setScreen({ name: "calibrate" });
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
    setScreen({ name: "menu" });
  };

  // load the face model in the background; returning players skip the start screen
  useEffect(() => {
    hub.preload();
    if (load("prefs", { input: "" }).input !== "camera") return;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((p) => {
        if (p.state !== "granted") return;
        startCam();
        hub.startCamera();
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

  const playing = screen.name === "menu" || screen.name === "game" || screen.name === "over" || screen.name === "practice";
  const lost = useFaceLost(camera && status === "ready" && playing, 800);
  const health = useTrackingHealth(camera && status === "ready" && playing && !recal);
  const needed = useRecalNeeded(camera && status === "ready" && playing && !recal);
  useEffect(() => {
    if (needed) setRecal(needed);
  }, [needed]);

  const finish = (mode: Pick, score: number) => {
    const id = idOf(mode);
    const prev = best[id] ?? 0;
    if (score > prev) {
      const next = { ...best, [id]: score };
      setBest(next);
      save("best", next);
    }
    setScreen({ name: "over", mode, score, newBest: score > prev });
  };
  const play = (mode: Pick) => setScreen({ name: "game", mode, run: Date.now() });

  return (
    <>
      {screen.name === "start" && <Start onCamera={startCam} onKeys={startKeys} />}
      {screen.name === "calibrate" && <Calibrate onDone={calibrated} onKeys={startKeys} />}
      {screen.name === "practice" && <Practice onDone={practiced} onRecalibrate={() => setScreen({ name: "calibrate" })} />}
      {screen.name === "menu" && (
        <Menu
          camera={camera}
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
          onOver={(s) => finish(screen.mode, s)}
          onRecalibrate={() => setScreen({ name: "calibrate" })}
        />
      )}
      {screen.name === "over" && (
        <Over
          camera={camera}
          mode={screen.mode}
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
          onKeys={() => {
            setRecal(null);
            startKeys();
          }}
          onSnooze={() => {
            hub.gaze.snoozeRecal(hub.latest.t);
            setRecal(null);
          }}
        />
      )}

      {health && !lost && !recal && (
        <span
          className={`health is-${health}`}
          role="status"
          title={health === "ok" ? "Tracking: good" : "Tracking is unsure, so picks wait until it's sure. Sit still and face the screen."}
        >
          {health === "ok" ? "" : "Hold still"}
        </span>
      )}
      {screen.name !== "start" && (
        <button className="gear" onClick={() => setSettingsOpen(true)} aria-label="settings" title="settings (s)">
          ⚙ <span>Settings</span>
        </button>
      )}

      {lost && !recal && (
        <div className="lost" role="status">
          <b>👀 I can't see you</b>
          <span>Sit in front of the screen and look at it</span>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        camera={camera}
        onClose={() => setSettingsOpen(false)}
        onRecalibrate={() => {
          setSettingsOpen(false);
          setScreen({ name: "calibrate" });
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
