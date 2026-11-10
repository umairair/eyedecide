import { MODES } from "../data/modes";
import { Picture } from "../pictures";

const find = (mode: string, name: string) => {
  const m = MODES.find((x) => x.id === mode)!;
  const deck = m.decks[0];
  return { deck, item: deck.items.find((x) => x.name === name) ?? deck.items[0] };
};
const LEFT = find("steam", "PUBG");
const RIGHT = find("youtube", "Gangnam Style");

export function Start({ onCamera, onKeys }: { onCamera: () => void; onKeys: () => void }) {
  return (
    <main className="start">
      <div className="start__demo" aria-hidden>
        {[LEFT, RIGHT].map(({ deck, item }, k) => (
          <div key={item.name} className={`mini ${k ? "mini--r" : "mini--l"}`}>
            <div className="mini__media">
              <Picture kind={deck.picture} item={item} />
            </div>
            <span>{item.name}</span>
          </div>
        ))}
        <div className="vs vs--mini">VS</div>
        <span className="start__eye" aria-hidden>
          👀
        </span>
      </div>
      <h1 className="logo">eyedecide</h1>
      <p className="start__tag">Two pictures. Which one is bigger? Look at it to answer.</p>
      <button className="btn btn--big" onClick={onCamera} autoFocus>
        ▶ Start
      </button>
      <button className="link link--big" onClick={onKeys}>
        No camera? Play with the mouse
      </button>
    </main>
  );
}
