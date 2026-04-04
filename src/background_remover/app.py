from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from background_remover.api import router
from background_remover.settings import APP_TITLE, APP_VERSION, HOST, PORT


def create_app() -> FastAPI:
    app = FastAPI(title=APP_TITLE, version=APP_VERSION)
    static_dir = Path(__file__).parent / "static"

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.include_router(router)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    return app


def run() -> None:
    uvicorn.run(
        "src.background_remover.app:create_app",
        host=HOST,
        port=PORT,
        factory=True,
        reload=False,
    )
