"use client";

// "Money" figlet banner for SCAPES, with $ replaced by full-block █ for a solid look.
// String.raw keeps the backslashes literal; lines are revealed on a stagger by motion.ts.
const BANNER = String.raw`
 ██████\   ██████\   ██████\  ███████\  ████████\  ██████\
██  __██\ ██  __██\ ██  __██\ ██  __██\ ██  _____|██  __██\
██ /  \__|██ /  \__|██ /  ██ |██ |  ██ |██ |      ██ /  \__|
\██████\  ██ |      ████████ |███████  |█████\    \██████\
 \____██\ ██ |      ██  __██ |██  ____/ ██  __|    \____██\
██\   ██ |██ |  ██\ ██ |  ██ |██ |      ██ |      ██\   ██ |
\██████  |\██████  |██ |  ██ |██ |      ████████\ \██████  |
 \______/  \______/ \__|  \__|\__|      \________| \______/
`
  .replace(/^\n/, "")
  .replace(/\n$/, "");

const LINES = BANNER.split("\n");

export function TitleAscii() {
  return (
    <h1 className="title-block" aria-label="The Scapes Project">
      <span className="title-kicker" aria-hidden>
        — THE —
      </span>
      <pre className="ascii" aria-hidden>
        {LINES.map((l, i) => (
          <span key={i} className="ascii-line">
            {l || " "}
          </span>
        ))}
      </pre>
      <span className="title-kicker title-kicker-b" aria-hidden>
        P · R · O · J · E · C · T
      </span>
    </h1>
  );
}
