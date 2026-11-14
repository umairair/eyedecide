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
            <p className="elsewhere__lead">A laptop or desktop is required to play.</p>
            <p>The gaze tracking is calibrated for a stationary webcam and a full-size display, and the face landmark model does not run reliably on mobile hardware.</p>
          </div>
          <button className="btn" onClick={onAbout}>
            info
          </button>
        </>
      )}
    </main>
  );
}
