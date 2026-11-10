import { sounds } from "../core/sound";
import { coverItems, type Mode } from "../data/modes";
import { Collage } from "../pictures";
import { Half, Split } from "../ui";
import { useBinaryChoice, useSettings } from "../hooks";

export function Over(props: {
  camera: boolean;
  mode: Mode;
  score: number;
  best: number;
  newBest: boolean;
  onMenu: () => void;
  onAgain: () => void;
}) {
  const { settings } = useSettings();
  const choice = useBinaryChoice(true, (side) => {
    if (settings.sound) sounds.pick();
    side === "left" ? props.onMenu() : props.onAgain();
  });

  return (
    <Split className="over" color={props.mode.color}>
      <header className="over__head">
        <h1 className="over__title">Game over</h1>
        <span className="over__score">{props.score}</span>
        {props.newBest ? <span className="newbest">New best</span> : <span className="over__best">Best {props.best}</span>}
        <p className="howto">{props.camera ? "Look at Play again, or at Menu to choose another game" : "Click Play again, or Menu to choose another game"}</p>
      </header>
      <Half side="left" panelRef={choice.leftRef} focused={choice.zone === "left"} label="menu" onClick={() => choice.choose("left")} dim badge="Menu" hint={props.camera}>
        <span className="mode__title mode__title--small">Menu</span>
      </Half>
      <Half
        side="right"
        panelRef={choice.rightRef}
        focused={choice.zone === "right"}
        label="play again"
        onClick={() => choice.choose("right")}
        color={props.mode.color}
        badge="Play again"
        hint={props.camera}
        media={<Collage entries={coverItems(props.mode)} />}
      >
        <span className="mode__title">{props.mode.title}</span>
      </Half>
    </Split>
  );
}
