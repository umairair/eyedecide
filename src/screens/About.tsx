/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function About({ onBack }: { onBack: () => void }) {
  return (
    <div className="overlay about" role="dialog" aria-modal="true" aria-label="about">
      <button className="chip about__back" onClick={onBack} autoFocus>
        back
      </button>
      <article>
        <h1>eyedecide</h1>
        <p className="about__lead">i built an eye tracking pipeline that runs entirely in the browser, then made this game to showcase it</p>
        <p>it started as a 36 hour solo build at cuhacking 6, where it took third place overall and the wolfram award among 350+ people, mostly in teams of four</p>
        <dl>
          <dt>pick</dt>
          <dd>look at an answer and hold</dd>
          <dt>pause</dt>
          <dd>close your eyes</dd>
          <dt>mouse</dt>
          <dd>click any time</dd>
          <dt>privacy</dt>
          <dd>video never leaves your device</dd>
        </dl>
        <nav>
          <a href="https://devpost.com/software/eyedecide-4dwxhn" target="_blank" rel="noreferrer">
            devpost
          </a>
          <a href="https://github.com/umairair/cuhacking2025" target="_blank" rel="noreferrer">
            github
          </a>
        </nav>
        <footer>built by umair</footer>
      </article>
    </div>
  );
}
