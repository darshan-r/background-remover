from __future__ import annotations

import io
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter
from rembg import new_session, remove

from background_remover.models import RenderOptions
from background_remover.settings import ALLOWED_MODEL_NAMES

MODEL_CACHE_DIR = Path(tempfile.gettempdir()) / "background-remover-models"


def _configure_runtime() -> None:
    MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Vercel functions need a writable model cache path instead of ~/.u2net.
    os.environ.setdefault("U2NET_HOME", str(MODEL_CACHE_DIR))

    # Keep ONNX inference conservative in serverless environments.
    if os.getenv("VERCEL"):
        os.environ.setdefault("OMP_NUM_THREADS", "1")


def process_image(image_bytes: bytes, options: RenderOptions) -> tuple[bytes, str]:
    """Remove the background and return a transparent PNG cutout."""
    _configure_runtime()
    model_name = options.model_name.strip().lower()
    if model_name not in ALLOWED_MODEL_NAMES:
        raise ValueError("Unsupported AI model.")

    cutout_bytes = remove(
        image_bytes,
        session=_get_session(model_name),
        post_process_mask=True,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=8,
        alpha_matting_erode_size=12,
    )

    with Image.open(io.BytesIO(cutout_bytes)) as source:
        image = source.convert("RGBA")
        alpha = image.getchannel("A").filter(ImageFilter.GaussianBlur(radius=0.6))
        image.putalpha(alpha)
        return _encode_png(image), "image/png"


@lru_cache(maxsize=4)
def _get_session(model_name: str) -> Any:
    return new_session(model_name)


def _encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
