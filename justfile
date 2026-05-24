set shell := ["bash", "-cu"]

# default: list available recipes
default:
    @just --list

# ---- install ---------------------------------------------------------------

install-client:
    cd client && npm install

install-py:
    cd python && uv sync

install: install-client install-py

# ---- dev -------------------------------------------------------------------

# Vite dev server with HMR (the @gepa-viz/app workspace); reads run.json from
# client/packages/app/public/ as a fallback. The library resolves from source,
# so editing components hot-reloads here too.
dev-client:
    cd client && npm run dev

# Run the DSPy GEPA spam demo against the dev run.json path.
dev-py *args:
    cd python && uv run python examples/demo_run.py {{args}}

# ---- build / package -------------------------------------------------------

# Build the @gepa-viz/react library (dist: index.js + index.d.ts + gepa-viz.css).
build-lib:
    cd client && npm run build:lib

# Build the SPA (the artifact bundled into the wheel).
build-app:
    cd client && npm run build:app

# Library first, then the app that consumes it.
build-client: build-lib build-app

sync-static: build-client
    rm -rf python/src/gepa_viz/static
    cp -R client/packages/app/dist python/src/gepa_viz/static
    # run.json is a dev fallback in the app's public/; not a shipped asset.
    rm -f python/src/gepa_viz/static/run.json

# Build the pip-installable wheel with the SPA bundled inside.
build: sync-static
    cd python && uv build

# Run the CLI from the source tree (no install needed).
serve *args:
    cd python && uv run gepa-viz serve {{args}}

# ---- lint ------------------------------------------------------------------

lint:
    cd client && npm run lint

# ---- clean -----------------------------------------------------------------

clean:
    rm -rf client/packages/react/dist client/packages/app/dist client/node_modules \
        python/src/gepa_viz/static python/dist python/.venv
