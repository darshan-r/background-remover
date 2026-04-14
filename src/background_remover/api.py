from __future__ import annotations

import logging
from pathlib import Path
from typing import Annotated, Final

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse, Response

from background_remover.image_service import process_image
from background_remover.models import RenderOptions
from background_remover.settings import MAX_UPLOAD_SIZE

router = APIRouter()
logger = logging.getLogger(__name__)
IMAGE_CONTENT_TYPE_PREFIX: Final[str] = "image/"


@router.get("/")
async def home() -> RedirectResponse:
    return RedirectResponse(url="/static/index.html", status_code=307)


@router.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/api/remove")
async def remove_background(
    file: Annotated[UploadFile, File(...)],
    model_name: Annotated[str, Form()] = "birefnet-general",
) -> Response:
    payload = await _read_image_payload(file)
    options = RenderOptions(model_name=model_name.strip().lower())

    try:
        image_bytes, media_type = process_image(payload, options)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("Background removal failed for model '%s'.", options.model_name)
        raise HTTPException(
            status_code=500,
            detail="Background removal failed for this image.",
        ) from exc

    stem = Path(file.filename or "image").stem
    filename = f"{stem}-no-bg.png"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=image_bytes, media_type=media_type, headers=headers)


async def _read_image_payload(file: UploadFile) -> bytes:
    if (
        not file.content_type
        or not file.content_type.startswith(IMAGE_CONTENT_TYPE_PREFIX)
    ):
        raise HTTPException(status_code=400, detail="Please upload an image file.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(payload) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Files must be 15 MB or smaller.")
    return payload
