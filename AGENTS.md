# Repository Guidelines

## Project Structure & Module Organization
This is a Next.js App Router project. Primary code lives in `src/app` (e.g., `layout.tsx`, `page.tsx`) with global styles in `src/app/globals.css`. Static assets (SVGs, favicons) are in `public/`. Repository-level configuration includes `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, and `postcss.config.mjs`.

## Build, Test, and Development Commands
- `npm run dev`: Start the local Next.js dev server (default `http://localhost:3000`).
- `npm run build`: Create a production build.
- `npm run start`: Serve the production build locally.
- `npm run lint`: Run ESLint checks (Next.js config).

## Coding Style & Naming Conventions
Follow existing TypeScript/React patterns. Use 2-space indentation, double quotes, and semicolons (match `src/app/page.tsx`). Components should be `PascalCase`, hooks `useSomething`, and route files follow Next.js App Router conventions (`page.tsx`, `layout.tsx`). Prefer Tailwind utility classes in JSX; keep global CSS in `src/app/globals.css`.

## Testing Guidelines
No test framework is configured yet. For changes, rely on `npm run lint`, `npm run build`, and manual verification in `npm run dev`. If you introduce a test setup, document the runner and naming conventions in this file.

## Commit & Pull Request Guidelines
The Git history only contains the initial commit, so no established convention exists. Use short, imperative commit subjects (e.g., "Add hero layout"). PRs should include a brief summary, testing notes (commands run), and screenshots for visual/UI changes.

## Agent-Specific Notes
This repository uses an `AGENTS.md` contributor guide. Keep updates concise and in sync with actual tooling and conventions.
