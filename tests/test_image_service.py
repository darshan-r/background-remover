from __future__ import annotations

from typing import Any, cast

import pytest
from PIL import UnidentifiedImageError

from background_remover.image_service import process_image
from background_remover.models import RenderOptions


def test_process_image_rejects_unknown_model() -> None:
    with pytest.raises(ValueError, match="Unsupported AI model."):
        process_image(
            b"irrelevant",
            RenderOptions(model_name=cast(Any, "invalid-model")),
        )


def test_process_image_raises_for_invalid_bytes(monkeypatch: Any) -> None:
    from background_remover import image_service

    monkeypatch.setattr(image_service, "_get_session", lambda _name: object())
    monkeypatch.setattr(
        image_service,
        "remove",
        lambda *_args, **_kwargs: b"not-an-image",
    )

    with pytest.raises(UnidentifiedImageError):
        process_image(b"image", RenderOptions())
