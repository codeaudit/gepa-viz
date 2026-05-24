# gepa-viz

Live visualization for [GEPA](https://github.com/gepa-ai/gepa) prompt-optimization runs. Renders the candidate tree as a force-directed graph so you can watch prompts evolve over a pareto frontier in real time.

- **Accepted candidates** are donuts whose ring segments are green/red per per-example valset score.
- **Rejected proposals** are small grey nodes (hover to see the feedback that produced them).
- **Click a node** for a detail view: the candidate prompt, prompt diff vs parent, reflection minibatch with per-example feedback, and the pareto frontier as a clickable pixel grid.

## Install (end users)

```bash
pip install gepa-viz
```

In your GEPA script — works equally with DSPy or base `gepa`:

```python
from gepa_viz import GepaVizCallback

# DSPy
dspy.GEPA(
    metric=...,
    auto="light",
    reflection_lm=...,
    gepa_kwargs={"callbacks": [GepaVizCallback(valset=valset, trainset=trainset, path="run.json")]},
).compile(student, trainset=trainset, valset=valset)

# Base gepa
gepa.optimize(..., callbacks=[GepaVizCallback(valset=valset, trainset=trainset, path="run.json")])
```

In another terminal:

```bash
gepa-viz serve --run run.json
```

A browser tab opens to `http://127.0.0.1:5151` and the graph extends node-by-node as GEPA accepts and rejects proposals.

## CLI

```
gepa-viz serve [--run PATH] [--host HOST] [--port N] [--open | --no-open]
```

Defaults: `--run ./run.json`, `--host 127.0.0.1`, `--port 5151`, browser opens on start. The server is a tiny stdlib `ThreadingHTTPServer` — no Node, no extra runtime.

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
