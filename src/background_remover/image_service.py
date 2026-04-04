from __future__ import annotations

import io
from functools import lru_cache
from typing import Any

from PIL import Image, ImageFilter
from rembg import new_session, remove

from background_remover.models import RenderOptions
from background_remover.settings import ALLOWED_MODEL_NAMES


def process_image(image_bytes: bytes, options: RenderOptions) -> tuple[bytes, str]:
    """Remove the background and return a transparent PNG cutout."""
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
