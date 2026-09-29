# Project context

- Bloomwild is a static browser game using vanilla HTML, CSS, JavaScript, Canvas, and inline SVG. There is no bundler, runtime package dependency, or backend.
- `game-core.js` exposes pure game rules, map data, creature artwork, and save validation as `window.BloomwildCore`. `game.js` owns UI, rendering, input, and battle state.
- Keep asset references relative so the game works under a GitHub Pages repository subdirectory. Publish the root directory from the repository's default branch using GitHub Pages' Deploy from a branch option.
- The playable files are `index.html`, `styles.css`, `game-core.js`, `game.js`, and `favicon.svg`. Google Fonts is optional; system sans-serif fallbacks work offline.
- Serve locally with `python -m http.server 8000 --bind 127.0.0.1`. Opening `index.html` directly also works, but browser storage policies can differ for file URLs.
- Browser tests use Python and Playwright, not Node.js. Install development dependencies with `python -m pip install -r requirements-dev.txt`, then run `python test_game.py`. Tests start their own temporary HTTP server and use isolated browser profiles. Chrome must be installed; set `BLOOMWILD_BROWSER=msedge` to use installed Edge instead. Screenshots go to the system temporary directory printed at the end of the run.
- The development machine has Python, Chrome, and Edge; Node.js, npm, and git are not on PATH. Do not add a Node build step just to serve this static game.
- Saves use the `bloomwild-save-v1` localStorage key. Always validate imported data with `parseSave`. Battles are transient; autosaves happen outside battles. Save export and import are available from the in-game Save options dialog.
- All creature names and SVG artwork are original. Preserve keyboard/touch controls, accessible dialog labels, and reduced-motion support when changing the UI.
