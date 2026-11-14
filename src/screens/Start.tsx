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
          <div className="elsewhere">
            <p className="elsewhere__lead">Open this on a laptop or desktop to play.</p>
            <p>I built it around a webcam and a bigger screen, and the eye tracking doesn't run well on a phone or tablet.</p>
          </div>
          <button className="btn" onClick={onAbout}>
            info
          </button>
        </>
      )}
    </main>
  );
}
