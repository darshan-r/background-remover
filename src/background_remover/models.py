from __future__ import annotations

from dataclasses import dataclass

from background_remover.settings import ALLOWED_MODEL_NAMES

DEFAULT_MODEL_NAME = ALLOWED_MODEL_NAMES[0]

@dataclass(slots=True)
class RenderOptions:
    model_name: str = DEFAULT_MODEL_NAME
