"""gepa-viz CLI — `gepa-viz serve` spins up a local dashboard."""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from importlib.abc import Traversable
from pathlib import Path
from typing import Any

logger = logging.getLogger("gepa_viz")

EMPTY_RUN_JSON = json.dumps({"examples": [], "candidates": {}}, indent=2).encode(
    "utf-8"
)


def _static_root() -> Traversable | None:
    """Locate the bundled SPA. Returns None if it's missing (dev install)."""
    try:
        root = resources.files("gepa_viz") / "static"
    except (ModuleNotFoundError, AttributeError):
        return None
    if not (root.is_dir() if hasattr(root, "is_dir") else False):
        return None
    if not (root / "index.html").is_file():
        return None
    return root


def _read_run_json(path: Path) -> bytes:
    try:
        with path.open("rb") as f:
            return f.read()
    except FileNotFoundError:
        return EMPTY_RUN_JSON


def _make_handler(run_path: Path, static_root: Traversable | None):
    """Build a request handler bound to a specific run path + static root."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            # Quiet the default per-request log; we only print startup.
            return

        def do_GET(self) -> None:  # noqa: N802 — required by BaseHTTPRequestHandler
            path = self.path.split("?", 1)[0]

            if path == "/run.json":
                self._serve_run_json()
                return

            self._serve_static(path)

        def do_HEAD(self) -> None:  # noqa: N802
            self.do_GET()

        def _serve_run_json(self) -> None:
            body = _read_run_json(run_path)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _serve_static(self, path: str) -> None:
            if static_root is None:
                self._send_plain(
                    HTTPStatus.NOT_FOUND,
                    "gepa-viz static bundle not found in this install.\n"
                    "Run `just build` to build the SPA into "
                    "python/src/gepa_viz/static/.",
                )
                return

            rel = path.lstrip("/") or "index.html"
            target = self._resolve_under(static_root, rel)
            if target is None or not target.is_file():
                # SPA fallback: client-side router handles unknown paths.
                target = static_root / "index.html"

            try:
                body = target.read_bytes()
            except OSError:
                self._send_plain(HTTPStatus.NOT_FOUND, "file not found")
                return

            mime, _ = mimetypes.guess_type(target.name)
            self.send_response(HTTPStatus.OK)
            self.send_header(
                "Content-Type", mime or "application/octet-stream"
            )
            if rel == "index.html":
                self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        @staticmethod
        def _resolve_under(
            root: Traversable, rel: str
        ) -> Traversable | None:
            # importlib.resources.Traversable.joinpath is safe — it raises on
            # absolute paths and segments containing path separators.
            try:
                target = root
                for part in rel.split("/"):
                    if not part or part in {".", ".."}:
                        return None
                    target = target / part
                return target
            except (ValueError, NotADirectoryError):
                return None

        def _send_plain(self, status: HTTPStatus, msg: str) -> None:
            body = msg.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def serve(args: argparse.Namespace) -> int:
    run_path = Path(args.run).expanduser().resolve()
    static_root = _static_root()

    handler_cls = _make_handler(run_path, static_root)
    server = ThreadingHTTPServer((args.host, args.port), handler_cls)

    url = f"http://{args.host}:{args.port}"
    print(f"gepa-viz serving on {url}")
    print(f"  run.json: {run_path}")
    if static_root is None:
        print(
            "  (warning: static bundle missing — run `just build`. /run.json still works.)"
        )

    if args.open:
        threading.Timer(0.2, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down…")
    finally:
        server.server_close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gepa-viz",
        description="Live visualization for GEPA optimization runs.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    serve_p = sub.add_parser("serve", help="Start the local dashboard.")
    serve_p.add_argument(
        "--run",
        default="run.json",
        help="Path to the run.json file that GepaVizCallback writes "
        "(default: ./run.json).",
    )
    serve_p.add_argument("--host", default="127.0.0.1")
    serve_p.add_argument("--port", type=int, default=5151)
    serve_p.add_argument(
        "--open",
        dest="open",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Open a browser tab on startup (default: on).",
    )
    serve_p.set_defaults(func=serve)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
