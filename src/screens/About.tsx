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
        <ul>
          <li>look at an answer and hold to pick it</li>
          <li>close your eyes to pause</li>
          <li>or just click</li>
          <li>it all runs in your browser, nothing gets sent anywhere</li>
        </ul>
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
