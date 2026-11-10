export function Start({ onPlay }: { onPlay: () => void }) {
  return (
    <main className="page">
      <h1 className="wordmark">eyedecide</h1>
      <button className="btn" onClick={onPlay} autoFocus>
        play
      </button>
    </main>
  );
}
