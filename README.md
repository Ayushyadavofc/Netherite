# Netherite

Netherite is a desktop second-brain app built with Electron, Vite, React, and TypeScript. It brings together notes, flashcards, habits, and todos in one focused workspace with a game-inspired interface.

## Highlights

- Markdown notes with vault-based organization
- Flashcards with spaced-repetition review
- Habit and todo tracking in the same app
- Attachment support for notes and study content
- Electron desktop shell with a hardened preload bridge

## Stack

- Electron
- Vite
- React
- TypeScript
- Tailwind CSS

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Project Structure

```text
src/
  main/       Electron main process
  preload/    secure renderer bridge
  renderer/   React frontend
public/       static assets
```

## Notes

- This export is prepared for GitHub upload.
- It intentionally excludes local build output, `node_modules`, and workspace-only reference folders.
- Auth/backend work is not included here.

## Status

This copy reflects the cleaned production-focused app source prepared from the local workspace.
