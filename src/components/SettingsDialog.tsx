import { useEffect, useRef, useState } from "react";
import { useSettings } from "../hooks";

/**
 * One small sheet. Nothing to tune: the tracker sets itself up and keeps
 * itself tuned. What's left is sound, a redo, how you play, and what this is.
 */
export function SettingsDialog(props: {
  /** which side opens first */
  open: false | "settings" | "info";
  camera: boolean;
  /** hide the controls: on the start screen there is nothing to set yet */
  infoOnly?: boolean;
  onClose: () => void;
  /** leave the game; absent when there is nothing to leave */
  onMenu?: () => void;
  onRecalibrate: () => void;
  onSwitchInput: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { settings, update } = useSettings();
  const [info, setInfo] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open) setInfo(props.open === "info");
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog ref={ref} className="settings" onClose={props.onClose} aria-label={info ? "about" : "settings"}>
      {info ? (
        <div className="about">
          <p>i built an eye tracking pipeline that runs entirely in the browser, then made this game to showcase it</p>
          <p>it started as a 36 hour solo build at cuhacking 6, where it took third place overall and the wolfram award</p>
          <p>look at an answer to pick it, close your eyes to pause</p>
          <nav>
            <a href="https://devpost.com/software/eyedecide-4dwxhn" target="_blank" rel="noreferrer">
              devpost
            </a>
            <a href="https://github.com/umairair/cuhacking2025" target="_blank" rel="noreferrer">
              github
            </a>
          </nav>
          <small>built by umair</small>
        </div>
      ) : (
        <div className="rows">
          {props.onMenu && <button onClick={props.onMenu}>menu</button>}
          <label>
            sound
            <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
          </label>
          {props.camera && <button onClick={props.onRecalibrate}>redo setup</button>}
          <button onClick={props.onSwitchInput}>{props.camera ? "use mouse" : "use eyes"}</button>
          <button onClick={() => setInfo(true)}>about</button>
        </div>
      )}
      <button className="btn btn--small" onClick={() => (info && !props.infoOnly ? setInfo(false) : props.onClose())} autoFocus>
        {info && !props.infoOnly ? "back" : "done"}
      </button>
    </dialog>
  );
}
