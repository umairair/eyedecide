import { useState } from "react";
import { ALL_MODES, coverItems, type Mode } from "../data/modes";
import { Collage } from "../pictures";
import { Half, Headline, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";

/** Left flips to the next game (quick). Right plays the one showing. */
export function Menu(props: { best: Record<string, number>; index: number; onPlay: (mode: Mode, index: number) => void }) {
  const [i, setI] = useState(props.index % ALL_MODES.length);
  const mode = ALL_MODES[i];
  const best = props.best[mode.id] ?? 0;

  const choice = useBinaryChoice(
    true,
    (side) => {
      if (side === "left") setI((n) => (n + 1) % ALL_MODES.length);
      else props.onPlay(mode, i);
    },
    { left: 0.55, right: 1 },
  );

  return (
    <Stage className="menu">
      <Plate
        foot={
          // with a mouse: jump straight to a game
          <div className="dots">
            {ALL_MODES.map((m, k) => (
              <button key={m.id} className={k === i ? "is-on" : ""} aria-label={m.title} aria-current={k === i} onClick={() => setI(k)} />
            ))}
          </div>
        }
      >
        <Headline as="h1" text={mode.title} />
        <p className="note">{mode.tagline}</p>
        {best > 0 && <span className="label">best {best}</span>}
      </Plate>

      <Half side="left" panelRef={choice.leftRef} focused={choice.zone === "left"} label="next game" onClick={() => choice.choose("left")}>
        <span className="word">next</span>
      </Half>

      <Half
        side="right"
        panelRef={choice.rightRef}
        focused={choice.zone === "right"}
        label={`play ${mode.title}`}
        onClick={() => choice.choose("right")}
        media={<Collage key={mode.id} entries={coverItems(mode, mode.id === "shuffle" ? 4 : 1)} />}
      >
        <span className="word">play</span>
      </Half>
    </Stage>
  );
}
