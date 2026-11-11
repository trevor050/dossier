/** A small fake portfolio used by `dossier demo` and `dossier serve --sample` so you can generate real events. */
export function sampleSite(opts: { replay: number }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sam Rivera — Portfolio (Dossier sample site)</title>
<style>
  body { margin: 0; font: 17px/1.6 system-ui, sans-serif; color: #1d1b18; background: #fbfaf7; }
  header, section { max-width: 760px; margin: 0 auto; padding: 72px 24px; }
  header { padding-top: 96px; }
  h1 { font-size: 44px; margin: 0 0 8px; letter-spacing: -0.02em; }
  h2 { font-size: 26px; margin: 0 0 12px; }
  section { border-top: 1px solid #e4dfd5; min-height: 60vh; }
  .note { background: #f6e3d6; padding: 10px 14px; border-radius: 6px; font-size: 14px; }
  .card { border: 1px solid #e4dfd5; border-radius: 8px; padding: 16px; margin: 12px 0; background: #fff; }
  button, .btn { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #1d1b18; background: #1d1b18; color: #fff; cursor: pointer; text-decoration: none; display: inline-block; }
  dialog { border: 1px solid #e4dfd5; border-radius: 8px; max-width: 520px; }
  input { font: inherit; padding: 8px; border: 1px solid #cfc8ba; border-radius: 6px; width: 100%; box-sizing: border-box; }
</style>
</head>
<body>
<header data-section="intro">
  <p class="note">This is the Dossier sample site. Everything you do here shows up in <a href="/api/admin" target="_blank">the dashboard</a>. Add <code>?to=some-name</code> to the URL to arrive as a named link.</p>
  <h1>Sam Rivera</h1>
  <p>Builds small, useful things. Currently studying computer science.</p>
  <a class="btn" href="#projects" data-track="see-projects">See projects</a>
</header>
<section id="projects" data-section="projects">
  <h2>Projects</h2>
  <div class="card" data-track="project-orbit"><b>Orbit</b> — a satellite pass predictor for amateur radio.</div>
  <div class="card" data-track="project-ledger"><b>Ledger</b> — splits shared grocery bills from a photo of the receipt.</div>
  <div class="card" data-track="project-pixel"><b>Pixel Room</b> — an interactive résumé drawn as a dorm room.</div>
</section>
<section id="experience" data-section="experience">
  <h2>Experience</h2>
  <p>Teaching assistant, intro to programming. Summer intern on a mapping team.</p>
  <button data-track="open-resume" onclick="window.dossier && dossier.enter('resume'); document.getElementById('resume').showModal()">Open résumé</button>
</section>
<section id="about" data-section="about">
  <h2>About</h2>
  <p>Likes trail running, old maps and well-made spreadsheets.</p>
</section>
<section id="contact" data-section="contact">
  <h2>Contact</h2>
  <p>Inputs are masked in session replays by default.</p>
  <input placeholder="Your email (masked in replays)">
  <p><a href="https://github.com" data-track="github">GitHub</a> · <a href="mailto:sam@example.com" data-track="email">Email</a></p>
</section>
<dialog id="resume">
  <h2>Résumé</h2>
  <p>Time spent in this dialog is attributed to the <b>resume</b> section via <code>dossier.enter('resume')</code>.</p>
  <button onclick="window.dossier && dossier.leave('resume'); document.getElementById('resume').close()">Close</button>
</dialog>
<script defer src="/api/collect" data-replay="${opts.replay}"></script>
</body>
</html>`;
}
