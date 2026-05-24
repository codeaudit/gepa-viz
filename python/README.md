# gepa-viz

Live visualization for GEPA prompt-optimization runs.

```bash
pip install gepa-viz
```

In your GEPA script:

```python
from gepa_viz import GepaVizCallback

# DSPy
dspy.GEPA(..., gepa_kwargs={"callbacks": [GepaVizCallback(valset, path="run.json")]})

# Base gepa
gepa.optimize(..., callbacks=[GepaVizCallback(valset, path="run.json")])
```

In another terminal:

```bash
gepa-viz serve --run run.json
```

A browser tab opens to `http://127.0.0.1:5151` and the graph extends in real time as the optimizer runs.

See the project README at the repo root for the full architecture and contributor docs.
