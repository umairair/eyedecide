import { CountUp, Half, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";

/** The run is over: what it scored, then set up the camera again or play another. */
export function Over(props: { score: number; best: number; newBest: boolean; onRecalibrate: () => void; onAgain: () => void }) {
  const choice = useBinaryChoice(true, (side) => {
    side === "left" ? props.onRecalibrate() : props.onAgain();
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
      <Half side="left" panelRef={choice.leftRef} focused={choice.zone === "left"} label="recalibrate" onClick={() => choice.choose("left")}>
        <span className="word">recalibrate</span>
      </Half>
      <Half side="right" panelRef={choice.rightRef} focused={choice.zone === "right"} label="play again" onClick={() => choice.choose("right")}>
        <span className="word">again</span>
      </Half>
    </Stage>
  );
}
