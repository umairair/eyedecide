import { CountUp, Half, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";

export function Over(props: { score: number; best: number; newBest: boolean; onMenu: () => void; onAgain: () => void }) {
  const choice = useBinaryChoice(true, (side) => {
    side === "left" ? props.onMenu() : props.onAgain();
  });

  return (
    <Stage className="over">
      <Plate>
        <div className={`score score--big ${props.newBest ? "is-new" : ""}`}>
          <b>
            <CountUp value={props.score} format={(n) => String(Math.round(n))} ms={700} />
          </b>
        </div>
        <span className="label">{props.newBest ? "new best" : `best ${props.best}`}</span>
      </Plate>
      <Half side="left" panelRef={choice.leftRef} focused={choice.zone === "left"} label="menu" onClick={() => choice.choose("left")}>
        <span className="word">menu</span>
      </Half>
      <Half side="right" panelRef={choice.rightRef} focused={choice.zone === "right"} label="play again" onClick={() => choice.choose("right")}>
        <span className="word">again</span>
      </Half>
    </Stage>
  );
}
