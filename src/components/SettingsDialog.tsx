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
      <Slider
        label="look time to pick"
        value={settings.dwellMs}
        display={`${(settings.dwellMs / 1000).toFixed(1)}s`}
        min={500}
        max={3000}
        step={100}
        onChange={(v) => update({ dwellMs: v })}
      />
      <Slider
        label="middle zone"
        value={settings.deadZone}
        display={`${Math.round(settings.deadZone * 100)}%`}
        min={0.1}
        max={0.6}
        step={0.05}
        onChange={(v) => update({ deadZone: v })}
      />
      <Slider
        label="smoothing"
        value={settings.smoothing}
        display={`${Math.round(settings.smoothing * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => update({ smoothing: v })}
      />

      <label className="toggle">
        sound
        <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
      </label>
      <label className="toggle">
        camera preview
        <input type="checkbox" checked={settings.preview} onChange={(e) => update({ preview: e.target.checked })} />
      </label>

      {props.camera && hub.calibration && (
        <p className="settings__diag">
          Tracking quality {Math.round(hub.calibration.quality)} · learned from {hub.gaze.stats.updates} picks
          {hub.gaze.stats.faulted.length > 0 && ` · ${hub.gaze.stats.faulted.length} sensor ignored`}
        </p>
      )}

      <div className="settings__actions">
        {props.camera && (
          <button className="link" onClick={props.onRecalibrate}>
            set up camera again
          </button>
        )}
        {props.camera && (
          <button className="link" onClick={props.onPractice}>
            show me how
          </button>
        )}
        <button className="link" onClick={props.onSwitchInput}>
          {props.camera ? "play with the mouse" : "play with my eyes"}
        </button>
        <button className="link" onClick={() => update(DEFAULT_SETTINGS)}>
          reset
        </button>
        <button className="btn btn--small" onClick={props.onClose} autoFocus>
          done
        </button>
      </div>
    </dialog>
  );
}

function Slider(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {props.label} <output>{props.display}</output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(+e.target.value)}
      />
    </label>
  );
}
