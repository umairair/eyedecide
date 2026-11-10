export function Start({ onCamera, onKeys }: { onCamera: () => void; onKeys: () => void }) {
  return (
    <main className="page">
      <h1 className="wordmark">eyedecide</h1>
      <button className="btn" onClick={onCamera} autoFocus>
        play
      </button>
      <button className="link" onClick={onKeys}>
        use mouse
      </button>
    </main>
  );
}
