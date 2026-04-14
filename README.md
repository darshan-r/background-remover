# Background Remover

A production-oriented web background remover with AI cutouts, Magic Wand cleanup, brush cleanup, and export controls.

## Setup

```bash
uv sync
```

## Run

```bash
python main.py
```

## Deploy On Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Leave the framework as `Other` or let Vercel detect FastAPI automatically.
4. Deploy with the repository root as the project root.

Vercel can use [api/index.py](/C:/codex/background-remover/api/index.py:1) as the FastAPI serverless entrypoint.
Static assets are served from `public/static`, which matches Vercel's FastAPI deployment guidance.

### Notes

- The app uses `rembg` CPU models, so cold starts can be slower than a typical lightweight API.
- The first request for a model can take longer because the model may need to be loaded on a fresh serverless instance.

## Windows Launcher

Double-click `run-app.bat` or run:

```bat
run-app.bat
```

## Features

- Drag-and-drop upload
- Higher-quality AI models for general and portrait cutouts
- Magic Wand cleanup with hover preview
- Manual brush cleanup for direct erase refinement
- White, black, or custom background fill
- PNG, JPEG, and WEBP export
- Original, result, and mask preview modes
- Responsive UI for desktop and mobile
