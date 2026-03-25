## Netherite Second Brain

Netherite is a desktop “second brain” experience built with Electron + Vite + React. It merges file-backed notes, a Markdown graph, flashcards (with SM-2 scheduling), habits, and todos into one gamified productivity shell.

### Key highlights
- **Notes & graph**: Markdown workspace with Obsidian-style [[wikilinks]], bidirectional graph, attachment previews, Mermaid flowcharts, and canvas sketching with multi-page exports.
- **Flashcards**: Markdown-based deck loader, SM-2 scheduling, review UI, embedded markdown rewrites, plus shared editor tooling (attachments, drawings, audio recording).
- **Habits & todos**: Vault-scoped state powered by `localStorage`, integrated into the dashboard’s RPG-style status screen.
- **Electron shell**: Custom main/preload bridges expose vault selection, file IO, dialogs, and window controls while keeping the renderer sandboxed.

### Getting started
1. Run `npm install`.
2. Launch development mode with `npm run dev`.
3. Build for production: `npm run build` (output lands in `out/`).

### Repo layout (important folders)
- `/src/main` (Electron entry, IPC, file helpers).  
- `/src/preload` (safe API spoon-fed to renderer).  
- `/src/renderer/src` (React renderer, notes/flashcards/habits/todos).  
- `/components`, `/app`, `/temp_baseline` (older snapshots—keep only if needed for reference).  
- `/package.json`, `/electron.vite.config.ts`, `/tsconfig.*` (tooling config).

### Development notes
- Keep `.env` and vault directories out of the repo; use the provided `.gitignore`.
- Run `npm run lint` / `npm run format` if those scripts exist, to keep styles consistent before pushing.
- Refer to `LIVE_PREVIEW_FIXES.md` for editor-specific quirks (e.g., wikilink behavior and canvas reliability).
