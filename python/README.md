# gepa-viz

Live visualization for GEPA prompt-optimization runs.

```bash
pip install gepa-viz
```

## Live run

Use `GepaVizCallback` as a context manager. Entering it spins up the dashboard
(a browser tab opens automatically) and streams the run to the page over SSE as
the optimizer works. Exiting dumps `run.json` and keeps the viewer alive until
you press Ctrl+C.

```python
from gepa_viz import GepaVizCallback

# DSPy
with GepaVizCallback(valset, trainset=trainset) as cb:
    dspy.GEPA(..., gepa_kwargs={"callbacks": [cb]}).compile(student, ...)

# Base gepa
with GepaVizCallback(valset, trainset=trainset) as cb:
    gepa.optimize(..., callbacks=[cb])
```

No second terminal or CLI step is needed — the viewer is part of the callback.

For headless/CI runs, pass `live=False` to skip the server and just dump
`run.json` at the end:

```python
with GepaVizCallback(valset, live=False, path="run.json") as cb:
    ...
```

`__init__` options: `path`, `trainset`, `live` (default `True`), `host`
(`127.0.0.1`), `port` (`5151`), `open_browser` (`True`), `keep_alive` (`True`),
`endpoint` (`None`), `endpoint_timeout` (`5.0`).

## Stream into a separate server

Instead of embedding a server, point the callback at a preexisting one with
`endpoint=`. Snapshots are POSTed to `<endpoint>/ingest`; the callback starts no
server of its own. Start the server with the CLI:

```bash
gepa-viz live                      # serves the SPA + /events + /ingest on :5151
```

```python
with GepaVizCallback(valset, endpoint="http://127.0.0.1:5151") as cb:
    dspy.GEPA(..., gepa_kwargs={"callbacks": [cb]}).compile(student, ...)
```

The server fans every pushed snapshot out to connected browsers over SSE. This
also works across machines — run `gepa-viz live --host 0.0.0.0` and point the
producer's `endpoint` at it.

## Re-open a finished run

`run.json` is a durable artifact. Re-open it any time in a static viewer (loads
once, no polling, no stream):

```bash
gepa-viz serve --file run.json
```

A browser tab opens to `http://127.0.0.1:5151`.

See the project README at the repo root for the full architecture and
contributor docs.
