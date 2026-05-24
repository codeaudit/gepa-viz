from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=_fallback)
    os.replace(tmp, path)


def _fallback(value: Any) -> Any:
    if hasattr(value, "toDict"):
        return value.toDict()
    if hasattr(value, "__dict__"):
        return {k: v for k, v in vars(value).items() if not k.startswith("_")}
    return repr(value)


def default_run_json_path() -> Path:
    """Resolve where to write run.json by default.

    Precedence:
    1. GEPA_VIZ_RUN_FILE env var, if set.
    2. <repo>/client/public/run.json — only when running from a checkout that
       has the dev SPA (so `npm run dev` picks the file up). Walks up from this
       module's location.
    3. <cwd>/run.json — the install case (matches `gepa-viz serve --run run.json`).
    """
    env = os.environ.get("GEPA_VIZ_RUN_FILE")
    if env:
        return Path(env).expanduser().resolve()
    here = Path(__file__).resolve().parent
    for p in [here, *here.parents]:
        candidate = p / "client" / "public"
        if candidate.is_dir():
            return candidate / "run.json"
    return Path.cwd() / "run.json"
