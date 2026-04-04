# Background Remover Details

## Goals

This application is designed to provide:

- Fast web-based background removal using multiple AI cutout models
- Precise cleanup with `Magic Wand` and `Brush`
- A responsive, editor-style review workflow
- A simple Python entrypoint with a lightweight FastAPI backend

## Current Architecture

### Backend

- `main.py`
  Single local entrypoint. Adds `src/` to `sys.path` and launches the app.
- `src/background_remover/app.py`
  FastAPI app factory and runtime startup configuration.
- `src/background_remover/api.py`
  HTTP routes, upload validation, and response handling.
- `src/background_remover/image_service.py`
  AI background removal integration through `rembg`.
- `src/background_remover/settings.py`
  Shared application constants.

### Frontend

The frontend is intentionally split into plain JavaScript modules:

- `src/background_remover/static/js/dom.js`
  Centralized DOM references.
- `src/background_remover/static/js/state.js`
  Editor state container.
- `src/background_remover/static/js/canvas.js`
  Canvas sizing, clearing, and drawing helpers.
- `src/background_remover/static/js/cleanup.js`
  Magic Wand region selection and brush erase operations.
- `src/background_remover/static/js/main.js`
  App orchestration, event wiring, preview generation, zoom, pan, export, and editor flow.

## Editor Workflow

1. Upload an image.
2. Optionally generate an AI cutout.
3. Optionally generate a preview pack across available models.
4. Apply any preview variant into the editor.
5. Use:
   - `Magic Wand` for connected trapped background regions
   - `Brush` for direct cleanup
6. Use:
   - mouse wheel to zoom
   - `Alt + drag` to pan while zoomed
7. Export the current working state.

## Preview Pack

The preview pack is generated client-side by calling `/api/remove` once per model preset.
Each preview card:

- renders a thumbnail
- identifies the model
- can be applied directly into the working editor

This keeps the backend simple while still giving users multi-model comparison.

## Zoom and Pan

The review canvas supports:

- zoom in
- zoom out
- reset to fit
- wheel zoom
- `Alt + drag` pan

Zoom is applied to the rendered viewport, and pointer mapping is converted back into working-image coordinates so the brush and wand continue to target correct pixels.

## Production Notes

### Strengths

- Clear backend/frontend separation
- Static assets served directly by FastAPI
- Tests for health, home, upload validation, and image-service failure behavior
- `ruff`, `mypy`, and `pytest` integrated into the project configuration

### Known Tradeoffs

- The frontend still uses vanilla JS rather than a typed UI framework
- Preview-pack generation makes multiple sequential requests and could be optimized later
- Magic Wand uses connected-region color similarity from the original image, which is practical but not equivalent to semantic selection

## Suggested Next Improvements

- Parallelize preview-pack generation
- Add cancellable preview generation
- Add keyboard shortcuts for tools and zoom
- Add editable eraser softness
- Add persistent user presets
- Add visual loading states on preview cards
- Add image dimension and file-size indicators
- Add backend request timing / structured logging
