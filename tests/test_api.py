from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from background_remover.app import create_app
from background_remover.models import RenderOptions


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_serves_index() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Generate Cutout" in response.text


def test_remove_endpoint_rejects_non_image_upload() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/remove",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"model_name": "birefnet-general"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Please upload an image file."


def test_remove_endpoint_returns_processed_png(monkeypatch: Any) -> None:
    from background_remover import api

    client = TestClient(create_app())

    def fake_process_image(
        image_bytes: bytes,
        options: RenderOptions,
    ) -> tuple[bytes, str]:
        assert image_bytes == b"image-bytes"
        assert options.model_name == "birefnet-general"
        return b"png-bytes", "image/png"

    monkeypatch.setattr(api, "process_image", fake_process_image)

    response = client.post(
        "/api/remove",
        files={"file": ("photo.png", b"image-bytes", "image/png")},
        data={"model_name": "birefnet-general"},
    )

    assert response.status_code == 200
    assert response.content == b"png-bytes"
    assert response.headers["content-type"] == "image/png"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="photo-no-bg.png"'
    )


def test_index_file_exists() -> None:
    index_path = Path("public/static/index.html")
    assert index_path.exists()
