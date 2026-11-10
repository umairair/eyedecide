import { useEffect, useMemo, useRef, useState } from "react";
import type { Side } from "../core/dwell";
import { firstRound, nextRound, pointsFor, preload, Recent, type Round } from "../core/rounds";
import { sounds } from "../core/sound";
import { modeOfDeck, type Mode } from "../data/modes";
import { Picture } from "../pictures";
import { CountUp, Half, Hearts, Split, Vs } from "../ui";
import { useBinaryChoice, useSettings } from "../hooks";
import { load, save } from "../core/storage";

const LIVES = 3;
const NEXT_MS = 1300;
const OVER_MS = 1700;
const MILESTONES = [3, 5, 15, 20, 30, 40, 50];
/** every this many in a row wins a heart back */
const HEART_EVERY = 10;
/** a "look at your answer" line under the question for the first rounds people ever play */
const COACH_ROUNDS = 6;
/** no answer for this long with a face in view: offer help */
const STUCK_MS = 20000;
/** wrong by less than this reads as "so close" (honest: the real gap is shown) */
const NEAR = 0.1;

const gap = (a: number, b: number) => Math.round((Math.abs(a - b) / Math.max(a, b)) * 100);

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
  best: number;
  onOver: (score: number) => void;
  onRecalibrate: () => void;
}) {
  const { mode } = props;
  const [played] = useState(() => load("prefs", { rounds: 0 }).rounds);
  const [stuck, setStuck] = useState(false);
  const { settings } = useSettings();
  const recent = useMemo(() => new Recent(storage(), mode.id), [mode.id]);
  const [round, setRound] = useState<Round>(() => firstRound(mode, recent));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [picked, setPicked] = useState<Side | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const choice = useBinaryChoice(!revealed, (side) => {
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
    if (settings.sound) (right ? sounds.correct : sounds.wrong)();

    // deal the next round now so its pictures load during the reveal
    const upcoming = nextLives > 0 ? nextRound(mode, round, nextScore, recent) : null;
    if (upcoming) preload(upcoming.left, upcoming.right);

    const apart = gap(round.left.value, round.right.value);
    setToast(
      heart
        ? "❤️ +1 life"
        : right && MILESTONES.includes(nextStreak)
          ? `🔥 ${nextStreak} in a row`
          : right && round.kind === "close"
            ? `⚡ Clutch +2`
            : !right && apart <= NEAR * 100
              ? `So close · ${Math.max(1, apart)}% apart`
              : upcoming?.retired && nextLives > 0
                ? `👑 ${upcoming.retired} retires`
                : right
                  ? "✓ Correct!"
                  : "✗ Wrong",
    );

    timer.current = window.setTimeout(
      () => {
        if (!upcoming) return props.onOver(nextScore);
        setPicked(null);
        setToast(null);
        setRound(upcoming);
      },
      right ? NEXT_MS : OVER_MS,
    );
  });

  const owner = modeOfDeck(deck) ?? mode;
  const color = mode.id === "shuffle" ? owner.color : mode.color;
  const chip =
    round.kind === "close" && !revealed
      ? "⚡ Close call · double points"
      : mode.id === "shuffle"
        ? owner.title
        : deck.topic
          ? `${mode.title} · ${deck.topic}`
          : mode.title;
  const countUp = deck.countUp !== false;

  const card = (side: Side) => {
    const item = round[side];
    const known = round.known === side;
    const shown = revealed || known;
    const unit = [deck.unit, deck.datedSub ? item.sub : null].filter(Boolean).join(" · ");
    return (
      <Half
        key={`${deck.id}-${side}-${item.name}`}
        side={side}
        panelRef={side === "left" ? choice.leftRef : choice.rightRef}
        focused={choice.zone === side}
        label={item.name}
        onClick={() => choice.choose(side)}
        hint={props.camera}
        result={revealed ? (side === winner ? "correct" : "wrong") : null}
        media={<Picture kind={deck.picture} item={item} />}
      >
        <span className="card__name">{item.name}</span>
        {item.sub && !deck.datedSub && <span className="card__sub">{item.sub}</span>}
        <span className={`card__value ${shown ? "is-shown" : ""}`}>
          {known || (revealed && !countUp) ? deck.format(item.value) : revealed ? <CountUp value={item.value} format={deck.format} /> : "?"}
        </span>
        {unit && <span className="card__unit">{unit}</span>}
      </Half>
    );
  };

  return (
    <Split className="game" color={color}>
      <header className="hud">
        <Hearts lives={lives} max={LIVES} />
        <div className="hud__mid">
          <span className={`chip ${round.kind === "close" && !revealed ? "chip--hot" : ""}`}>{chip}</span>
          <h2 key={deck.id} className="question">
            {deck.question}
          </h2>
          {played + round.n < COACH_ROUNDS && !revealed && (
            <p className="coach">{props.camera ? "Look at your answer and keep looking" : "Click your answer"}</p>
          )}
        </div>
        <div className="hud__score">
          <span key={score} className="hud__num">
            {score}
          </span>
          <span className="hud__label">{streak >= 2 ? `🔥 ${streak}` : `best ${Math.max(props.best, score)}`}</span>
        </div>
      </header>

      {card("left")}
      {card("right")}
      <Vs state={revealed ? (correct ? "correct" : "wrong") : null} />
      {toast && <div className="toast">{toast}</div>}
      {deck.source && <p className="credit">{deck.source}</p>}
      {stuck && (
        <div className="helpbar helpbar--float">
          <span>Stuck? Look at a picture and hold, or just click it.</span>
          <button className="btn btn--small" onClick={props.onRecalibrate}>
            Set up camera again
          </button>
        </div>
      )}
    </Split>
  );
}
