import { useEffect, useMemo, useRef, useState } from "react";
import type { Side } from "../core/dwell";
import { firstRound, nextRound, pointsFor, Recent, type Round } from "../core/rounds";
import type { Mode } from "../data/modes";
import { Picture, preload } from "../pictures";
import { CountUp, Half, Headline, Icon, Lives, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";
import { load, save } from "../core/storage";

const LIVES = 3;
const NEXT_MS = 1300;
const OVER_MS = 1700;
/** every this many in a row wins a heart back */
const HEART_EVERY = 10;
/** no answer for this long with a face in view: offer help */
const STUCK_MS = 20000;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function Game(props: {
  mode: Mode;
  camera: boolean;
  /** something is showing over the game: don't take answers */
  paused: boolean;
  best: number;
  /** every point as it's scored, so a run that gets abandoned still counts toward the best */
  onScore: (score: number) => void;
  onOver: (score: number) => void;
  onRecalibrate: () => void;
}) {
  const { mode } = props;
  const [played] = useState(() => load("prefs", { rounds: 0 }).rounds);
  const [stuck, setStuck] = useState(false);
  const recent = useMemo(() => new Recent(storage(), mode.id), [mode.id]);
  const [round, setRound] = useState<Round>(() => firstRound(mode, recent));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [picked, setPicked] = useState<Side | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const { deck } = round;
  const winner: Side = round.left.value > round.right.value ? "left" : "right";
  const revealed = picked !== null;
  const correct = revealed && picked === winner;

  // nothing picked for a while: maybe the tracking isn't working for them
  useEffect(() => {
    setStuck(false);
    if (!props.camera || revealed) return;
    const t = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(t);
  }, [round, revealed, props.camera]);

  const choice = useBinaryChoice(!revealed && !props.paused, (side) => {
    const right = side === winner;
    save("prefs", { ...load("prefs", {}), rounds: played + round.n + 1 });
    const nextStreak = right ? streak + 1 : 0;
    const nextScore = right ? score + pointsFor(round) : score;
    const heart = right && nextStreak % HEART_EVERY === 0 && lives < LIVES;
    const nextLives = right ? lives + (heart ? 1 : 0) : lives - 1;
    setPicked(side);
    setScore(nextScore);
    setStreak(nextStreak);
    setLives(nextLives);
    if (right) props.onScore(nextScore);

    // deal the next round now so its pictures load during the reveal
    const upcoming = nextLives > 0 ? nextRound(mode, round, nextScore, recent) : null;
    if (upcoming) preload(upcoming.deck.picture, upcoming.left, upcoming.right);

    timer.current = window.setTimeout(
      () => {
        if (!upcoming) return props.onOver(nextScore);
        setPicked(null);
        setRound(upcoming);
      },
      right ? NEXT_MS : OVER_MS,
    );
  });

  const countUp = deck.countUp !== false;

  const card = (side: Side) => {
    const item = round[side];
    const known = round.known === side;
    const unit = [deck.unit, deck.datedSub ? item.sub : null].filter(Boolean).join(" · ");
    return (
      <Half
        key={`${deck.id}-${side}-${item.name}`}
        side={side}
        panelRef={side === "left" ? choice.leftRef : choice.rightRef}
        focused={choice.zone === side}
        label={item.name}
        onClick={() => choice.choose(side)}
        result={revealed ? (side === winner ? "correct" : "wrong") : null}
        miss={picked === side && side !== winner}
        media={<Picture kind={deck.picture} item={item} />}
      >
        <span className="name">{item.name}</span>
        {item.sub && !deck.datedSub && <span className="sub">{item.sub}</span>}
        <span className={`value ${revealed || known ? "" : "is-hidden"}`}>
          {known || (revealed && !countUp) ? deck.format(item.value) : revealed ? <CountUp value={item.value} format={deck.format} /> : "?"}
        </span>
        {unit && <span className="unit">{unit}</span>}
      </Half>
    );
  };

  return (
    <Stage className="game">
      {/* lives, question and score all sit on the plate: nothing to read anywhere else */}
      <Plate>
        <Lives lives={lives} max={LIVES} />
        <div className="qa">
        <div className={`ask ${revealed ? "is-answered" : ""}`}>
          <Headline text={deck.question} />
          {round.kind === "close" && <span className="tag">2×</span>}
          {stuck && (
            <div className="help">
              <button className="btn btn--small btn--line" onClick={props.onRecalibrate}>
                recalibrate
              </button>
            </div>
          )}
        </div>
        {/* the answer takes the question's place: right where the eyes come back to */}
        {revealed && (
          <div className={`verdict ${correct ? "" : "is-wrong"}`}>
            <Icon name={correct ? "check" : "cross"} />
          </div>
        )}
        </div>
        <div className="score">
          <b key={score}>{score}</b>
        </div>
        {streak >= 3 ? <span className="label">{streak} streak</span> : props.best > score && <span className="label">best {props.best}</span>}
        <p className="sr" role="status">
          {revealed ? (correct ? "Correct" : "Wrong") : ""}
        </p>
      </Plate>

      {card("left")}
      {card("right")}
    </Stage>
  );
}
