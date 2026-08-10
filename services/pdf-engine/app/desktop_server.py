from __future__ import annotations

import argparse
import logging
import os
import shutil
import socket
import sys
import tempfile
from dataclasses import dataclass
from logging.handlers import RotatingFileHandler
from pathlib import Path
from types import FrameType
from typing import Sequence

import uvicorn

DESKTOP_HOST = "127.0.0.1"
DEFAULT_PORT = 0
LOG_FILE_NAME = "pdf-engine.log"


class DesktopServerError(RuntimeError):
    """Raised when the desktop-only server configuration is unsafe or invalid."""


@dataclass(frozen=True)
class DesktopPaths:
    data_dir: Path
    log_dir: Path
    temp_dir: Path
    cache_dir: Path

    def create(self) -> None:
        for path in (self.data_dir, self.log_dir, self.temp_dir, self.cache_dir):
            path.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class DesktopServerOptions:
    host: str
    port: int
    paths: DesktopPaths


class DesktopUvicornServer(uvicorn.Server):
    def __init__(self, config: uvicorn.Config, readiness_url: str) -> None:
        super().__init__(config)
        self.readiness_url = readiness_url

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets=sockets)
        if self.started:
            print(f"PDF_ENGINE_READY {self.readiness_url}", flush=True)
            logging.getLogger(__name__).info(
                "Desktop PDF engine health endpoint ready"
            )

    def handle_exit(self, sig: int, frame: FrameType | None) -> None:
        super().handle_exit(sig, frame)
        # Uvicorn 0.34 re-raises captured signals after a graceful shutdown,
        # which reports the managed desktop sidecar as killed (-15 on Linux).
        # Tauri owns this child process, so completing shutdown with code 0 is
        # the useful lifecycle contract here.
        self._captured_signals.clear()


def _path_argument(value: str) -> Path:
    return Path(value).expanduser().resolve()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Serveur local du moteur PDF pour PDF Studio Local.",
    )
    parser.add_argument("--host", default=DESKTOP_HOST)
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PDF_ENGINE_PORT", DEFAULT_PORT)),
    )
    parser.add_argument(
        "--data-dir",
        type=_path_argument,
        required=True,
    )
    parser.add_argument(
        "--log-dir",
        type=_path_argument,
        required=True,
    )
    parser.add_argument(
        "--temp-dir",
        type=_path_argument,
        required=True,
    )
    parser.add_argument(
        "--cache-dir",
        type=_path_argument,
        required=True,
    )
    return parser


def parse_options(arguments: Sequence[str] | None = None) -> DesktopServerOptions:
    namespace = build_parser().parse_args(arguments)
    if namespace.host != DESKTOP_HOST:
        raise DesktopServerError(
            "Le serveur desktop doit écouter uniquement sur 127.0.0.1."
        )
    if not 0 <= namespace.port <= 65535:
        raise DesktopServerError("Le port doit être compris entre 0 et 65535.")

    return DesktopServerOptions(
        host=namespace.host,
        port=namespace.port,
        paths=DesktopPaths(
            data_dir=namespace.data_dir,
            log_dir=namespace.log_dir,
            temp_dir=namespace.temp_dir,
            cache_dir=namespace.cache_dir,
        ),
    )


def configure_environment(paths: DesktopPaths) -> Path:
    paths.create()
    os.environ["PDF_ENGINE_DESKTOP"] = "1"
    os.environ["PDF_ENGINE_DATA_DIR"] = str(paths.data_dir)
    os.environ["PDF_ENGINE_CACHE_DIR"] = str(paths.cache_dir)
    os.environ["TMPDIR"] = str(paths.temp_dir)
    os.environ["TEMP"] = str(paths.temp_dir)
    os.environ["TMP"] = str(paths.temp_dir)
    tempfile.tempdir = str(paths.temp_dir)

    from app import main as app_main

    app_main.OUTPUT_DIR = paths.data_dir / "output"
    app_main.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log_path = paths.log_dir / LOG_FILE_NAME
    handler = RotatingFileHandler(
        log_path,
        maxBytes=2 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(handler)
    return log_path


def create_listening_socket(host: str, port: int) -> socket.socket:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind((host, port))
        listener.listen(128)
    except OSError:
        listener.close()
        raise
    return listener


def run_server(options: DesktopServerOptions) -> int:
    log_path = configure_environment(options.paths)
    listener = create_listening_socket(options.host, options.port)
    actual_port = int(listener.getsockname()[1])

    from app.main import app

    config = uvicorn.Config(
        app,
        host=options.host,
        port=actual_port,
        log_level="info",
        log_config=None,
        access_log=False,
        reload=False,
    )
    readiness_url = f"http://{options.host}:{actual_port}/health"
    server = DesktopUvicornServer(config, readiness_url)
    logging.getLogger(__name__).info(
        "Starting desktop PDF engine host=%s port=%s log=%s",
        options.host,
        actual_port,
        log_path.name,
    )
    try:
        server.run(sockets=[listener])
    finally:
        listener.close()
        _clean_temporary_contents(options.paths.temp_dir)
    return 0 if server.started else 3


def _clean_temporary_contents(temp_dir: Path) -> None:
    try:
        children = list(temp_dir.iterdir())
    except OSError:
        return
    for child in children:
        try:
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        except OSError:
            logging.getLogger(__name__).warning(
                "Temporary desktop artifact cleanup failed: %s",
                child.name,
            )


def main(arguments: Sequence[str] | None = None) -> int:
    try:
        return run_server(parse_options(arguments))
    except (DesktopServerError, OSError, ValueError) as error:
        print(f"PDF_ENGINE_START_ERROR {error}", file=sys.stderr, flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
