# Repository Guidelines

## Project Structure & Module Organization
This is a static site. Primary files are `index.html` and `styles.css`. Static assets (GIFs, favicons) live in `bg/` or the repository root as needed.

## Build, Test, and Development Commands
- No build step is required. Open `index.html` directly or serve the folder with any static file server.
- Production is `https://mackley.co`, served by GitHub Pages from the `main` branch and `CNAME`. Push live site changes to `origin main`; do not use `mackley.vercel.app` or Vercel as the production target.

## Coding Style & Naming Conventions
Use 2-space indentation, double quotes, and semicolons in HTML/CSS. Keep HTML minimal and readable; keep all styling in `styles.css`.

## Testing Guidelines
No automated tests are configured. Manually verify in a browser.

## Commit & Pull Request Guidelines
The Git history only contains the initial commit, so no established convention exists. Use short, imperative commit subjects (e.g., "Add hero layout"). PRs should include a brief summary, testing notes (commands run), and screenshots for visual/UI changes.

## Agent-Specific Notes
This repository uses an `AGENTS.md` contributor guide. Keep updates concise and in sync with actual tooling and conventions.
For live publishes, commit and push to `origin main`, then verify the GitHub Pages deployment and `https://mackley.co`.
