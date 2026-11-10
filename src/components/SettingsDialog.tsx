import { useEffect, useRef } from "react";
import { DEFAULT_SETTINGS, useSettings } from "../hooks";
import { hub } from "../tracking/InputHub";

export function SettingsDialog(props: {
  open: boolean;
  camera: boolean;
  onClose: () => void;
  onRecalibrate: () => void;
  onPractice: () => void;
  onSwitchInput: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { settings, update } = useSettings();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog ref={ref} className="settings" onClose={props.onClose} aria-label="settings">
      <h2 className="head">Settings</h2>
      {/* the tracking controls mean nothing with the mouse */}
      {props.camera && (
        <>
          <Slider
            label="Hold time"
            value={settings.dwellMs}
            display={`${(settings.dwellMs / 1000).toFixed(1)}s`}
            min={500}
            max={3000}
            step={100}
            onChange={(v) => update({ dwellMs: v })}
          />
          <Slider
            label="Middle gap"
            value={settings.deadZone}
            display={`${Math.round(settings.deadZone * 100)}%`}
            min={0.1}
            max={0.6}
            step={0.05}
            onChange={(v) => update({ deadZone: v })}
          />
          <Slider
            label="Smoothing"
            value={settings.smoothing}
            display={`${Math.round(settings.smoothing * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update({ smoothing: v })}
          />
        </>
      )}

      <label className="toggle">
        Sound
        <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
      </label>
      {props.camera && (
        <label className="toggle">
          Show camera when lost
          <input type="checkbox" checked={settings.preview} onChange={(e) => update({ preview: e.target.checked })} />
        </label>
      )}

      {props.camera && hub.calibration && (
        <p className="settings__diag">
          Tracking {Math.round(hub.calibration.quality)} · {hub.gaze.stats.updates} picks learned
          {hub.gaze.stats.faulted.length > 0 && ` · ${hub.gaze.stats.faulted.length} sensor off`}
        </p>
      )}

      <div className="settings__actions">
        {props.camera && (
          <button className="btn btn--small btn--line" onClick={props.onRecalibrate}>
            Redo setup
          </button>
        )}
        {props.camera && (
          <button className="btn btn--small btn--line" onClick={props.onPractice}>
            Practice
          </button>
        )}
        <button className="btn btn--small btn--line" onClick={props.onSwitchInput}>
          {props.camera ? "Use mouse" : "Use eyes"}
        </button>
        <button className="btn btn--small btn--line" onClick={() => update(DEFAULT_SETTINGS)}>
          Reset
        </button>
        <button className="btn btn--small" onClick={props.onClose} autoFocus>
          Done
        </button>
      </div>
    </dialog>
  );
}

function Slider(props: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>
        {props.label} <output>{props.display}</output>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(+e.target.value)} />
    </label>
  );
}
