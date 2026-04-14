from __future__ import annotations

from pathlib import Path

APP_TITLE = "Background Remover"
APP_VERSION = "0.1.0"
HOST = "127.0.0.1"
PORT = 8000
MAX_UPLOAD_SIZE = 15 * 1024 * 1024
ROOT_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT_DIR / "public" / "static"
ALLOWED_MODEL_NAMES = (
    "birefnet-general",
    "birefnet-portrait",
    "isnet-general-use",
)
