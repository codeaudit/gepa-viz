"""HTTP server for the gepa-viz dashboard.

Two modes share one request handler:

* **live** — the embedded server started by ``GepaVizCallback``. State lives in
  memory in a :class:`Hub`; the browser subscribes to ``/events`` (SSE) and gets
  the current snapshot on connect plus every subsequent snapshot pushed to it.
* **static** — ``gepa-viz serve --file run.json``. No SSE; ``/run.json`` is read
  from disk once per request and the page loads it a single time.

The client decides which behaviour to use by fetching ``/config.json`` on boot.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import queue
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from importlib.abc import Traversable
from pathlib import Path
from typing import Any

logger = logging.getLogger("gepa_viz")

EMPTY_RUN = {"examples": [], "candidates": {}}
EMPTY_RUN_JSON = json.dumps(EMPTY_RUN, indent=2).encode("utf-8")

# Sentinel pushed to subscriber queues to tell the SSE loop to close.
_CLOSE = object()


def static_root() -> Traversable | None:
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


class Hub:
    """Thread-safe fan-out of run snapshots to connected SSE clients.

    The producer (``GepaVizCallback`` running on the optimizer's thread) calls
    :meth:`publish` with the full run state after every event. Each connected
    browser holds one queue; ``publish`` drops the snapshot onto all of them and
    stashes it as :attr:`latest` so late joiners get current state on connect.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: set[queue.Queue[Any]] = set()
        self._latest: dict[str, Any] = dict(EMPTY_RUN)

    def publish(self, snapshot: dict[str, Any]) -> None:
        with self._lock:
            self._latest = snapshot
            subscribers = list(self._subscribers)
        for q in subscribers:
            q.put(snapshot)

    def latest(self) -> dict[str, Any]:
        with self._lock:
            return self._latest

    def subscribe(self) -> queue.Queue[Any]:
        q: queue.Queue[Any] = queue.Queue()
        with self._lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.Queue[Any]) -> None:
        with self._lock:
            self._subscribers.discard(q)

    def close(self) -> None:
        with self._lock:
            subscribers = list(self._subscribers)
        for q in subscribers:
            q.put(_CLOSE)


def _make_handler(
    *,
    mode: str,
    root: Traversable | None,
    hub: Hub | None,
    run_path: Path | None,
):
    """Build a request handler bound to a mode + data source."""

    def read_run_json() -> bytes:
        if hub is not None:
            return json.dumps(hub.latest(), ensure_ascii=False).encode("utf-8")
        if run_path is not None:
            try:
                return run_path.read_bytes()
            except FileNotFoundError:
                return EMPTY_RUN_JSON
        return EMPTY_RUN_JSON

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            # Quiet the default per-request log; we only print startup.
            return

        def handle(self) -> None:
            # A browser closing an SSE tab resets the socket mid-request; that's
            # normal here, so don't let socketserver dump a traceback for it.
            try:
                super().handle()
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self) -> None:  # noqa: N802 — required by BaseHTTPRequestHandler
            path = self.path.split("?", 1)[0]
            if path == "/config.json":
                self._serve_config()
            elif path == "/run.json":
                self._serve_run_json()
            elif path == "/events":
                self._serve_events()
            else:
                self._serve_static(path)

        def do_HEAD(self) -> None:  # noqa: N802
            self.do_GET()

        def do_POST(self) -> None:  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path == "/ingest":
                self._ingest()
            else:
                self._send_plain(HTTPStatus.NOT_FOUND, "not found")

        def _ingest(self) -> None:
            """Accept a run snapshot pushed by a remote producer."""
            if hub is None:
                self._send_plain(
                    HTTPStatus.NOT_FOUND, "ingest only available in live mode"
                )
                return
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length) if length else b""
            try:
                snapshot = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                self._send_plain(HTTPStatus.BAD_REQUEST, "invalid json")
                return
            hub.publish(snapshot)
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()

        def _serve_config(self) -> None:
            self._send_json(json.dumps({"mode": mode}).encode("utf-8"))

        def _serve_run_json(self) -> None:
            self._send_json(read_run_json())

        def _serve_events(self) -> None:
            if hub is None:
                self._send_plain(HTTPStatus.NOT_FOUND, "events only available in live mode")
                return
            q = hub.subscribe()
            try:
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                self._sse_send(hub.latest())
                while True:
                    snapshot = q.get()
                    if snapshot is _CLOSE:
                        break
                    self._sse_send(snapshot)
            except (BrokenPipeError, ConnectionResetError):
                pass  # client navigated away
            finally:
                hub.unsubscribe(q)

        def _sse_send(self, snapshot: dict[str, Any]) -> None:
            payload = json.dumps(snapshot, ensure_ascii=False)
            self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
            self.wfile.flush()

        def _serve_static(self, path: str) -> None:
            if root is None:
                self._send_plain(
                    HTTPStatus.NOT_FOUND,
                    "gepa-viz static bundle not found in this install.\n"
                    "Run `just build` to build the SPA into "
                    "python/src/gepa_viz/static/.",
                )
                return

            rel = path.lstrip("/") or "index.html"
            target = self._resolve_under(root, rel)
            if target is None or not target.is_file():
                # SPA fallback: client-side router handles unknown paths.
                target = root / "index.html"

            try:
                body = target.read_bytes()
            except OSError:
                self._send_plain(HTTPStatus.NOT_FOUND, "file not found")
                return

            mime, _ = mimetypes.guess_type(target.name)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mime or "application/octet-stream")
            if rel == "index.html":
                self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        @staticmethod
        def _resolve_under(root: Traversable, rel: str) -> Traversable | None:
            try:
                target = root
                for part in rel.split("/"):
                    if not part or part in {".", ".."}:
                        return None
                    target = target / part
                return target
            except (ValueError, NotADirectoryError):
                return None

        def _send_json(self, body: bytes) -> None:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_plain(self, status: HTTPStatus, msg: str) -> None:
            body = msg.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def make_server(
    host: str,
    port: int,
    *,
    mode: str,
    hub: Hub | None = None,
    run_path: Path | None = None,
) -> ThreadingHTTPServer:
    """Create (but don't start) a dashboard server.

    Pass ``hub`` for live mode or ``run_path`` for static mode. If ``port`` is
    taken, falls back to an OS-assigned ephemeral port; read the bound port from
    ``server.server_address[1]``.
    """
    handler = _make_handler(
        mode=mode, root=static_root(), hub=hub, run_path=run_path
    )
    try:
        return ThreadingHTTPServer((host, port), handler)
    except OSError:
        logger.warning("port %s unavailable; binding an ephemeral port", port)
        return ThreadingHTTPServer((host, 0), handler)


def start_background(server: ThreadingHTTPServer) -> threading.Thread:
    """Run ``server.serve_forever()`` on a daemon thread and return it."""
    thread = threading.Thread(
        target=server.serve_forever, name="gepa-viz-server", daemon=True
    )
    thread.start()
    return thread
