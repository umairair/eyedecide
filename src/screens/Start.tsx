export function Start({ onCamera, onKeys, onAbout }: { onCamera: () => void; onKeys: () => void; onAbout: () => void }) {
  return (
    <main className="page">
      <h1 className="wordmark">eyedecide</h1>
      <button className="btn" onClick={onCamera} autoFocus>
        play
      </button>
      <button className="link" onClick={onKeys}>
        use mouse
      </button>
      <button className="link about-link" onClick={onAbout}>
        about
      </button>
    </main>
  );
}
