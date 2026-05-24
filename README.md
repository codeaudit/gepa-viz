# gepa-viz

![demo](assets/ful-gepa-run-viz-trimmed.gif)

Live visualization for [GEPA](https://github.com/gepa-ai/gepa) prompt-optimization runs. Renders the candidate tree as a force-directed graph so you can watch prompts evolve over a pareto frontier in real time.

- **Accepted candidates** are donuts whose ring segments are green/red per per-example valset score.
- **Rejected proposals** are small grey nodes (hover to see the feedback that produced them).
- **Click a node** for a detail view: the candidate prompt, prompt diff vs parent, reflection minibatch with per-example feedback, and the pareto frontier as a clickable pixel grid.


## Install (end users)

```bash
pip install gepa-viz
```

`GepaVizCallback` is a context manager. Entering it streams the run into the
dashboard; exiting dumps a `run.json` artifact. There are three ways to use it.

### 1. Embedded (default) — the callback runs its own viewer

Entering `with GepaVizCallback(...)` spins up a local server and opens a browser
tab; the graph extends node-by-node over SSE as GEPA accepts and rejects
proposals. Exiting dumps `run.json` and keeps the viewer alive until you Ctrl+C.
No second terminal, no CLI step. Works equally with DSPy or base `gepa`:

```python
from gepa_viz import GepaVizCallback

# DSPy
with GepaVizCallback(valset=valset, trainset=trainset) as cb:
    dspy.GEPA(
        metric=..., auto="light", reflection_lm=...,
        gepa_kwargs={"callbacks": [cb]},
    ).compile(student, trainset=trainset, valset=valset)

# Base gepa
with GepaVizCallback(valset=valset, trainset=trainset) as cb:
    gepa.optimize(..., callbacks=[cb])
```

### 2. Remote — stream into a standalone server

Run one long-lived server and point the callback at it with `endpoint=`. The
callback starts no server of its own; it POSTs snapshots to `<endpoint>/ingest`
and the server fans them out to connected browsers over SSE. Useful when the
optimizer runs on a different machine (`gepa-viz live --host 0.0.0.0`).

```bash
gepa-viz live          # serves the SPA + /events + /ingest on :5151
```

```python
with GepaVizCallback(valset=valset, trainset=trainset,
                     endpoint="http://127.0.0.1:5151") as cb:
    dspy.GEPA(..., gepa_kwargs={"callbacks": [cb]}).compile(student, ...)
```

### 3. Static — dump now, view later

Pass `live=False` for a headless/CI run that just writes `run.json` at the end,
then re-open it any time in a static viewer (loads once, no streaming):

```python
with GepaVizCallback(valset=valset, live=False, path="run.json") as cb:
    dspy.GEPA(..., gepa_kwargs={"callbacks": [cb]}).compile(student, ...)
```

```bash
gepa-viz serve --file run.json
```

`GepaVizCallback` options: `path`, `trainset`, `live` (default `True`), `host`
(`127.0.0.1`), `port` (`5151`), `open_browser` (`True`), `keep_alive` (`True`),
`endpoint` (`None`), `endpoint_timeout` (`5.0`).

## Reading the Visualization

### Big Nodes
![big-nodes](assets/pareto-comparison.gif)
Big nodes are candidates that were evaluated on the valset. Each segment on the ring is a seperate example. Red segments are examples the candidate got wrong and green are examples the candidate got right.

As you can see candidates 1 and 2 have the same accuracy but performed well on different examples.

## Node Details
![node-details](assets/node-details-page.gif)
Node details page shows information for the candidate in more depth.
**Valset Results**
The grid at the top shows the candidates response to each example and whether it got it right or wrong. 

**Prompt**
Shows the prompt for the candidate. Use the toggle switch to see the diff between the prompt and its parent.

**Mini-Batch**
The mini batch results for the candidate. Diffs show the difference between the initial attempt and the post-reflection attempt on the minibatch.

## Small Nodes
![small-nodes](assets/rejected-node.gif)
The small grey nodes are candidates that were rejected at the minibatch phase. After reflection the mini-batch was retried and the score didn't go up. Therefore they were never evaluated on the valset and aren't on the pareto frontier, however you can view their in depth details all the same.

## Edges
![edges-hover](assets/feedback-edges.gif)
If you hover on the edges in the graph you will see the feedback that was given to the reflection model to generate the child candidate.





## CLI

```
gepa-viz serve [--file PATH] [--host HOST] [--port N] [--open | --no-open]
gepa-viz live  [--host HOST] [--port N] [--open | --no-open]
```

- `serve` — **static** viewer for a dumped `run.json` (loads once, no polling).
  Defaults: `--file ./run.json`, `--host 127.0.0.1`, `--port 5151`.
- `live` — **live** server a remote producer streams into via `/ingest`; serves
  the SPA and pushes updates to browsers over SSE.

The server is a tiny stdlib `ThreadingHTTPServer` — no Node, no extra runtime.

## Repo layout

```
gepa-viz/
  client/      # Vite SPA (React + react-router + d3 + Tailwind)
  python/      # gepa_viz Python package (callback + CLI + bundled SPA)
  justfile     # build automation
```

The end-user wheel ships the pre-built SPA inside `gepa_viz/static/` so installation is just `pip install`.

## Develop

Prerequisites: `node`, `npm`, `uv`, `just`.

```bash
just install         # npm ci + uv sync
just dev-client      # Vite dev server with HMR on :5173
just dev-py          # run examples/demo_run.py (needs OPENAI_API_KEY)
just build           # build SPA + bundle into wheel → python/dist/*.whl
just serve           # run gepa-viz serve from the source tree
just lint            # ESLint on src/
just clean
```

During development the SPA reads `run.json` from `client/public/run.json` (Vite serves it as a static asset). The Python callback writes there by default when it detects it's running inside the repo. For production-style testing, run `just build` and `pip install python/dist/*.whl` into a throwaway venv.

## Schema

The callback writes a JSON file with this shape (the SPA reads from it; you can also hand-craft a `run.json` for offline browsing):

```jsonc
{
  "examples": [
    { /* arbitrary input fields */, "ground_truth": { /* output fields */ } }
  ],
  "candidates": {
    "0":   { "prompt": "...", "parent": null, "score": 0.62,
             "predictions": [{"prediction": {...}, "score": 1.0}], "minibatch": null },
    "0.1": { "prompt": "...", "parent": "0",  "score": null,
             "predictions": null,
             "minibatch": [{"example": {...}, "parent_prediction": {...},
                            "parent_score": 0.0, "prediction": {...},
                            "score": 0.0, "feedback": "..."}] },
    "1":   { "prompt": "...", "parent": "0",  "score": 0.81, "predictions": [...], "minibatch": [...] }
  }
}
```

- **Accepted candidate ids** are integer strings (`"0"`, `"1"`, `"2"`, …), matching gepa's internal index.
- **Rejected candidate ids** are `"<parent>.<n>"` with `n` starting at 1 per parent.

## License

MIT.
