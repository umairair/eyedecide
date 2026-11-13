import { useEffect, useMemo, useRef, useState } from "react";
import type { Side } from "../core/dwell";
import { clockFor, heatFor, MAX_MULT, multiplier, REVEAL_MS } from "../core/pace";
import { firstRound, nextRound, pointsFor, Recent, type Round } from "../core/rounds";
import { DECKS } from "../data/decks";
import { Picture, preload } from "../pictures";
import { CountUp, Half, Headline, Icon, Lives, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";
import { load, save } from "../core/storage";
import { hub } from "../tracking/InputHub";

const LIVES = 3;
/** every this many in a row wins a heart back */
const HEART_EVERY = 10;
/** the clock ran out this many times running with a face in view: offer help */
const STUCK_AFTER = 2;
/** the last stretch of the clock, when its line starts to pulse */
const LOW = 0.25;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** what happened this round: the side picked (null = the clock ran out) and what it scored */
interface Outcome {
  picked: Side | null;
  right: boolean;
  gained: number;
}

export function Game(props: {
  camera: boolean;
  /** something is showing over the game: don't take answers */
  paused: boolean;
  best: number;
  /** every point as it's scored, so a run that gets abandoned still counts toward the best */
  onScore: (score: number) => void;
  onOver: (score: number) => void;
  onRecalibrate: () => void;
}) {
  const [played] = useState(() => load("prefs", { rounds: 0 }).rounds);
  const recent = useMemo(() => new Recent(storage()), []);
  const [round, setRound] = useState<Round>(() => firstRound(DECKS, recent));
  const [score, setScore] = useState(0);
  /** rounds won, close calls counting double: what the difficulty climbs on (the score runs away with the multiplier) */
  const [level, setLevel] = useState(0);
  const [streak, setStreak] = useState(0);
  const [heat, setHeat] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [timeouts, setTimeouts] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const { deck } = round;
  const winner: Side = round.left.value > round.right.value ? "left" : "right";
  const revealed = outcome !== null;
  const mult = multiplier(heat);

  /** the clock's line, and how much of it is left (1 = full) */
  const clock = useRef<HTMLSpanElement>(null);
  const left = useRef(1);

  /** one answer a round: a look landing as the clock runs out can't count twice */
  const answered = useRef(false);
  const answer = (side: Side | null) => {
    if (answered.current) return;
    answered.current = true;
    const right = side === winner;
    save("prefs", { ...load("prefs", {}), rounds: played + round.n + 1 });
    const gained = right ? mult * pointsFor(round) : 0;
    const nextStreak = right ? streak + 1 : 0;
    const nextScore = score + gained;
    const nextLevel = right ? level + pointsFor(round) : level;
    const heart = right && nextStreak % HEART_EVERY === 0 && lives < LIVES;
    const nextLives = right ? lives + (heart ? 1 : 0) : lives - 1;
    setOutcome({ picked: side, right, gained });
    setScore(nextScore);
    setLevel(nextLevel);
    setStreak(nextStreak);
    setHeat(right ? heat + heatFor(left.current) : 0);
    setLives(nextLives);
    setTimeouts(side === null ? timeouts + 1 : 0);
    if (right) props.onScore(nextScore);

    // deal the next round now so its pictures load during the reveal
    const upcoming = nextLives > 0 ? nextRound(DECKS, round, nextLevel, recent) : null;
    if (upcoming) preload(upcoming.deck.picture, upcoming.left, upcoming.right);

    timer.current = window.setTimeout(
      () => {
        if (!upcoming) return props.onOver(nextScore);
        answered.current = false;
        setOutcome(null);
        setRound(upcoming);
      },
      right ? REVEAL_MS.right : REVEAL_MS.wrong,
    );
  };

  const choice = useBinaryChoice(!revealed && !props.paused, answer);

  // The clock. It stops for anything that isn't the player's doing (a pause,
  // something covering the game, the camera losing them), and it never cuts
  // off a look that is already filling: finish the look, beat the buzzer.
  const live = useRef({ answer, paused: props.paused, camera: props.camera, zone: choice.zone });
  live.current = { answer, paused: props.paused, camera: props.camera, zone: choice.zone };
  useEffect(() => {
    if (revealed) return;
    const el = clock.current;
    const total = clockFor(round.n);
    let ms = total;
    let last = performance.now();
    let low = false;
    let raf = 0;
    el?.classList.remove("is-low");
    const paint = () => {
      left.current = ms / total;
      el?.style.setProperty("--t", left.current.toFixed(4));
      if (left.current < LOW !== low) el?.classList.toggle("is-low", (low = !low));
    };
    paint();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(100, now - last));
      last = now;
      const { paused, camera, zone } = live.current;
      const unseen = camera && !hub.latest.face;
      if (!paused && !hub.paused && !unseen) ms = Math.max(0, ms - dt);
      paint();
      // out of time, unless a look is under way or the tracker itself is struggling
      const shaky = camera && hub.latest.health !== "ok";
      if (ms <= 0 && !paused && !hub.paused && !unseen && !zone && !shaky) return live.current.answer(null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round, revealed]);

  const countUp = deck.countUp !== false;

  const card = (side: Side) => {
    const item = round[side];
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
        hit={outcome?.picked === side && outcome.right}
        miss={outcome?.picked === side && !outcome.right}
        heat
        media={<Picture kind={deck.picture} item={item} />}
      >
        <span className="name">{item.name}</span>
        {item.sub && !deck.datedSub && <span className="sub">{item.sub}</span>}
        <span className={`value ${revealed ? "" : "is-hidden"}`}>
          {!revealed ? "?" : countUp ? <CountUp value={item.value} format={deck.format} /> : deck.format(item.value)}
        </span>
        {unit && <span className="unit">{unit}</span>}
      </Half>
    );
  };

  const cls = ["game", revealed && "is-revealed", outcome && !outcome.right && "is-cold", outcome?.picked === null && "is-timeout"];

  return (
    <Stage className={cls.filter(Boolean).join(" ")} data-mult={mult} data-fever={mult === MAX_MULT || undefined}>
      {/* the one colour in the game: it warms as the streak builds, and the look lines are drawn in it */}
      <svg className="defs" aria-hidden>
        <defs>
          <linearGradient id="heat" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="heat-a" />
            <stop offset="1" className="heat-b" />
          </linearGradient>
        </defs>
      </svg>

      <div className="aura" aria-hidden />

      {/* lives, question and score all sit on the plate: nothing to read anywhere else */}
      <Plate>
        {/* the clock: a line round the plate that runs down */}
        <span className="clock" ref={clock} aria-hidden>
          <b>
            <i />
          </b>
          <i />
        </span>
        <Lives lives={lives} max={LIVES} />
        <div className="qa">
          <div className={`ask ${revealed ? "is-answered" : ""}`}>
            <Headline text={deck.question} />
            {round.kind === "close" && <span className="tag">double</span>}
            {props.camera && timeouts >= STUCK_AFTER && (
              <div className="help">
                <button className="btn btn--small btn--line" onClick={props.onRecalibrate}>
                  recalibrate
                </button>
              </div>
            )}
          </div>
          {/* the answer takes the question's place: right where the eyes come back to */}
          {outcome &&
            (outcome.right ? (
              <b className="gain">+{outcome.gained}</b>
            ) : (
              <div className="verdict is-wrong">
                <Icon name="cross" />
              </div>
            ))}
        </div>
        <div className="score">
          <b key={score}>{score}</b>
        </div>
        {mult > 1 ? (
          <span key={mult} className="mult">
            ×{mult}
          </span>
        ) : (
          props.best > score && <span className="label">best {props.best}</span>
        )}
        <p className="sr" role="status">
          {outcome ? (outcome.right ? "Correct" : outcome.picked ? "Wrong" : "Out of time") : ""}
        </p>
      </Plate>

      {card("left")}
      {card("right")}
    </Stage>
  );
}
