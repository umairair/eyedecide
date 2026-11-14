/** The front door. Without `onPlay` (a phone or tablet) it says where to play, and info is the one thing to press. */
export function Start({ onPlay, onAbout }: { onPlay?: () => void; onAbout: () => void }) {
  return (
    <main className="page">
      <h1 className="wordmark">eyedecide</h1>
      {onPlay ? (
        <>
          <button className="btn" onClick={onPlay} autoFocus>
            play
          </button>
          <button className="link" onClick={onAbout}>
            info
          </button>
        </>
      ) : (
        <>
          <p className="note">play on a laptop or desktop</p>
          <button className="btn" onClick={onAbout}>
            info
          </button>
        </>
      )}
    </main>
  );
}
