import { useState } from "react";
import { sounds } from "../core/sound";
import { ALL_MODES, coverItems, type Mode } from "../data/modes";
import { Collage } from "../pictures";
import { Half, Split } from "../ui";
import { useBinaryChoice, useSettings } from "../hooks";

/** Look left to flip to the next mode (quick), look right to play it. */
export function Menu(props: {
  camera: boolean;
  best: Record<string, number>;
  index: number;
  onPlay: (mode: Mode, index: number) => void;
}) {
  const { settings } = useSettings();
  const [i, setI] = useState(props.index % ALL_MODES.length);
  const mode = ALL_MODES[i];
  const next = ALL_MODES[(i + 1) % ALL_MODES.length];
  const best = props.best[mode.id] ?? 0;

  const choice = useBinaryChoice(
    true,
    (side) => {
      if (settings.sound) sounds.pick();
      if (side === "left") setI((n) => (n + 1) % ALL_MODES.length);
      else props.onPlay(mode, i);
    },
    { left: 0.55, right: 1 },
  );

  return (
    <Split className="menu" color={mode.color}>
      <header className="menu__head">
        <h1 className="logo logo--small">eyedecide</h1>
        <p className="howto">
          {props.camera ? (
            <>
              Look at <b>Play</b> to start this game. Look at the other side to see a different one.
            </>
          ) : (
            <>
              Click <b>Play</b> to start this game, or the other side to see a different one.
            </>
          )}
        </p>
        <div className="dots" aria-label={`${i + 1} of ${ALL_MODES.length}`}>
          {ALL_MODES.map((m, k) => (
            <span key={m.id} className={k === i ? "is-on" : ""} style={{ background: k === i ? m.color : undefined }} />
          ))}
        </div>
      </header>

      <Half
        side="left"
        panelRef={choice.leftRef}
        focused={choice.zone === "left"}
        label={`next: ${next.title}`}
        onClick={() => choice.choose("left")}
        color={next.color}
        dim
        badge="Other game"
        hint={props.camera}
        media={<Collage key={next.id} entries={coverItems(next)} />}
      >
        <span className="card__name">{next.title}</span>
      </Half>

      <Half
        side="right"
        panelRef={choice.rightRef}
        focused={choice.zone === "right"}
        label={`play ${mode.title}`}
        onClick={() => choice.choose("right")}
        color={mode.color}
        badge="Play"
        hint={props.camera}
        media={<Collage key={mode.id} entries={coverItems(mode)} />}
      >
        <span key={mode.id} className="mode__title">
          {mode.title}
        </span>
        <span className="card__sub">{mode.tagline}</span>
        {best > 0 && <span className="mode__best">Best {best}</span>}
      </Half>
    </Split>
  );
}
