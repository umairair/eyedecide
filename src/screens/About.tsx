/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function About({ onBack }: { onBack: () => void }) {
  return (
    <div className="overlay about" role="dialog" aria-modal="true" aria-label="info">
      <article>
        <h1>eyedecide</h1>
        <p className="about__lead">I built an eye tracking pipeline that runs entirely in the browser, then made this game to showcase it.</p>
        <p>It started as a 36 hour solo build at cuHacking 6, where it took third place overall and the Wolfram Award among 350+ people, mostly in teams of four.</p>
        <p>Look at an answer and hold to pick it, close your eyes to pause.</p>
        <p>Your data is safe as there is no backend server, the face detection model is loaded locally into your browser.</p>
        <p className="about__sign">- Umair</p>
        <nav>
          <a href="https://devpost.com/software/eyedecide-4dwxhn" target="_blank" rel="noreferrer">
            devpost
          </a>
          <a href="https://www.linkedin.com/in/umairmal/" target="_blank" rel="noreferrer">
            linkedin
          </a>
          <a href="https://github.com/umairair/eyedecide" target="_blank" rel="noreferrer">
            github repo
          </a>
        </nav>
      </article>
      {/* back sits where info was, at the bottom middle: just the word */}
      <button className="link about__back" onClick={onBack} autoFocus>
        back
      </button>
    </div>
  );
}
