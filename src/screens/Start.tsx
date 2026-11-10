export function Start({ onPlay, onAbout }: { onPlay: () => void; onAbout: () => void }) {
  return (
    <main className="page">
      <h1 className="wordmark">eyedecide</h1>
      <button className="btn" onClick={onPlay} autoFocus>
        play
      </button>
      <button className="link" onClick={onAbout}>
        about
      </button>
    </main>
  );
}
