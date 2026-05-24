"""gepa-viz CLI — `gepa-viz serve --file run.json` opens a static dashboard.

Live runs spin up their own viewer from inside ``GepaVizCallback`` (see
``callback.py``). This command is for re-opening a ``run.json`` that a finished
run dumped: it serves the bundled SPA in *static* mode — the page loads the file
exactly once, no polling, no event stream.
"""

from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from pathlib import Path

from .server import Hub, make_server, static_root


def live(args: argparse.Namespace) -> int:
    """Run a standalone live server that producers stream into via /ingest."""
    hub = Hub()
    server = make_server(args.host, args.port, mode="live", hub=hub)
    port = server.server_address[1]

    url = f"http://{args.host}:{port}"
    print(f"gepa-viz live server on {url}")
    print(f"  point a producer at it:  GepaVizCallback(..., endpoint=\"{url}\")")
    if static_root() is None:
        print(
            "  (warning: static bundle missing — run `just build`. /events + /ingest still work.)"
        )

    if args.open:
        threading.Timer(0.2, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down…")
    finally:
        hub.close()
        server.server_close()
    return 0


def serve(args: argparse.Namespace) -> int:
    run_path = Path(args.file).expanduser().resolve()
    server = make_server(args.host, args.port, mode="static", run_path=run_path)
    port = server.server_address[1]

    url = f"http://{args.host}:{port}"
    print(f"gepa-viz serving (static) on {url}")
    print(f"  run.json: {run_path}")
    if static_root() is None:
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

    serve_p = sub.add_parser(
        "serve", help="Open a static dashboard for a dumped run.json."
    )
    serve_p.add_argument(
        "--file",
        "--run",
        dest="file",
        default="run.json",
        help="Path to the run.json a finished run dumped (default: ./run.json).",
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

    live_p = sub.add_parser(
        "live",
        help="Run a standalone live server that a remote producer streams into.",
    )
    live_p.add_argument("--host", default="127.0.0.1")
    live_p.add_argument("--port", type=int, default=5151)
    live_p.add_argument(
        "--open",
        dest="open",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Open a browser tab on startup (default: on).",
    )
    live_p.set_defaults(func=live)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
