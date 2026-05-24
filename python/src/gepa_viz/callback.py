from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .writer import atomic_write_json, default_run_json_path


def _normalize_example(ex: Any) -> dict[str, Any]:
    if isinstance(ex, dict):
        return dict(ex)
    inputs_fn = getattr(ex, "inputs", None)
    labels_fn = getattr(ex, "labels", None)
    if callable(inputs_fn) and callable(labels_fn):
        inputs = dict(inputs_fn())
        labels = dict(labels_fn())
        out = dict(inputs)
        if labels:
            out["ground_truth"] = labels
        return out
    if hasattr(ex, "toDict"):
        return dict(ex.toDict())
    if hasattr(ex, "__dict__"):
        return {k: v for k, v in vars(ex).items() if not k.startswith("_")}
    return {"value": repr(ex)}


def _normalize_output(out: Any) -> Any:
    if out is None:
        return None
    if isinstance(out, (str, int, float, bool)):
        return out
    if isinstance(out, dict):
        return {k: _normalize_output(v) for k, v in out.items()}
    if isinstance(out, (list, tuple)):
        return [_normalize_output(v) for v in out]
    if hasattr(out, "toDict"):
        return dict(out.toDict())
    if hasattr(out, "__dict__"):
        return {k: _normalize_output(v) for k, v in vars(out).items() if not k.startswith("_")}
    return repr(out)


def _flatten_prompt(candidate_text: dict[str, str]) -> str:
    if len(candidate_text) == 1:
        return next(iter(candidate_text.values()))
    return "\n\n".join(
        f"# component: {name}\n{text}" for name, text in candidate_text.items()
    )


@dataclass
class _IterationBuffer:
    minibatch_ids: list[Any] = field(default_factory=list)
    parent_engine_idx: int | None = None
    parent_outputs: list[Any] = field(default_factory=list)
    parent_scores: list[float] = field(default_factory=list)
    candidate_outputs: list[Any] = field(default_factory=list)
    candidate_scores: list[float] = field(default_factory=list)
    candidate_prompt: dict[str, str] | None = None
    feedback: list[str] = field(default_factory=list)
    eval_end_count: int = 0


class GepaVizCallback:
    def __init__(
        self,
        valset: Iterable[Any],
        *,
        path: str | Path | None = None,
        trainset: Iterable[Any] | None = None,
    ) -> None:
        self._path = Path(path) if path is not None else default_run_json_path()
        self._valset: list[Any] = list(valset)
        self._trainset: list[Any] = list(trainset) if trainset is not None else []
        self._val_index_by_data_id: dict[Any, int] = {}
        self._examples_serialized: list[dict[str, Any]] = []
        self._candidates: dict[str, dict[str, Any]] = {}
        # Rejected candidates are named "<parent viz id>.<n>" where n increments
        # per parent. Counter keyed by parent viz id string.
        self._rejection_counter: dict[str, int] = {}
        # When `on_valset_evaluated` fires for an accepted candidate before
        # `on_candidate_accepted` (gepa's actual ordering), park the eval
        # here keyed by engine_idx and apply it once the candidate exists.
        self._pending_valset_eval: dict[int, dict[str, Any]] = {}
        self._buf = _IterationBuffer()

        for i, ex in enumerate(self._valset):
            self._val_index_by_data_id[i] = i
            self._examples_serialized.append(_normalize_example(ex))

        self._write()

    # ----- lifecycle -----------------------------------------------------

    def on_optimization_start(self, event: dict[str, Any]) -> None:
        seed_candidate = event.get("seed_candidate") or {}
        # Seed viz id is "0", matching gepa's engine_idx for the seed.
        self._candidates["0"] = {
            "prompt": _flatten_prompt(seed_candidate) if seed_candidate else "",
            "parent": None,
            "score": None,
            "predictions": None,
            "minibatch": None,
        }
        self._write()

    def on_iteration_start(self, event: dict[str, Any]) -> None:
        self._buf = _IterationBuffer()

    def on_iteration_end(self, event: dict[str, Any]) -> None:
        self._write()

    # ----- per-iteration buffering --------------------------------------

    def on_candidate_selected(self, event: dict[str, Any]) -> None:
        # The selected candidate IS the parent of whatever proposal this iteration produces.
        idx = event.get("candidate_idx")
        if isinstance(idx, int):
            self._buf.parent_engine_idx = idx

    def on_minibatch_sampled(self, event: dict[str, Any]) -> None:
        self._buf.minibatch_ids = list(event.get("minibatch_ids", []))

    def on_evaluation_end(self, event: dict[str, Any]) -> None:
        outputs = list(event.get("outputs") or [])
        scores = list(event.get("scores") or [])
        if self._buf.eval_end_count == 0:
            self._buf.parent_outputs = outputs
            self._buf.parent_scores = scores
        elif self._buf.eval_end_count == 1:
            self._buf.candidate_outputs = outputs
            self._buf.candidate_scores = scores
        self._buf.eval_end_count += 1

    def on_reflective_dataset_built(self, event: dict[str, Any]) -> None:
        dataset = event.get("dataset") or {}
        if not dataset:
            return
        first_component = next(iter(dataset.values()), [])
        self._buf.feedback = [
            str(entry.get("Feedback", "")) for entry in first_component
        ]

    def on_proposal_end(self, event: dict[str, Any]) -> None:
        new_instructions = event.get("new_instructions") or {}
        self._buf.candidate_prompt = dict(new_instructions)

    # ----- accept / reject ----------------------------------------------

    def on_candidate_accepted(self, event: dict[str, Any]) -> None:
        engine_idx = event.get("new_candidate_idx")
        if engine_idx is None:
            return
        # CandidateAcceptedEvent.parent_ids is authoritative for the new candidate's parent(s).
        event_parent_ids = list(event.get("parent_ids") or [])
        parent_engine_idx = (
            event_parent_ids[0]
            if event_parent_ids
            else self._buf.parent_engine_idx
        )
        viz_id = str(engine_idx)
        parent_viz_id = (
            str(parent_engine_idx) if parent_engine_idx is not None else None
        )
        # gepa calls _run_full_eval_and_add (which fires on_valset_evaluated)
        # BEFORE firing on_candidate_accepted. So by the time we get here, the
        # valset eval for this engine_idx has already been buffered.
        pending = self._pending_valset_eval.pop(engine_idx, None)
        self._candidates[viz_id] = {
            "prompt": _flatten_prompt(self._buf.candidate_prompt or {}),
            "parent": parent_viz_id,
            "score": pending["score"] if pending else None,
            "predictions": pending["predictions"] if pending else None,
            "minibatch": self._build_minibatch(),
        }

    def on_candidate_rejected(self, event: dict[str, Any]) -> None:
        parent_engine_idx = self._buf.parent_engine_idx
        if parent_engine_idx is None:
            # Shouldn't happen — on_candidate_selected always fires earlier in
            # the iteration. Bail rather than emit a candidate with no parent.
            return
        parent_viz_id = str(parent_engine_idx)
        n = self._rejection_counter.get(parent_viz_id, 0) + 1
        self._rejection_counter[parent_viz_id] = n
        viz_id = f"{parent_viz_id}.{n}"
        self._candidates[viz_id] = {
            "prompt": _flatten_prompt(self._buf.candidate_prompt or {}),
            "parent": parent_viz_id,
            "score": None,
            "predictions": None,
            "minibatch": self._build_minibatch(),
        }

    def on_valset_evaluated(self, event: dict[str, Any]) -> None:
        engine_idx = event.get("candidate_idx")
        if engine_idx is None:
            return

        scores_by_id = event.get("scores_by_val_id") or {}
        outputs_by_id = event.get("outputs_by_val_id") or {}
        n = len(self._examples_serialized)
        predictions: list[dict[str, Any]] = []
        for i in range(n):
            score = float(scores_by_id.get(i, 0.0))
            raw_pred = outputs_by_id.get(i) if outputs_by_id else None
            predictions.append(
                {
                    "prediction": _normalize_output(raw_pred) or {},
                    "score": score,
                }
            )
        avg = event.get("average_score")
        score_value = (
            float(avg)
            if avg is not None
            else (sum(p["score"] for p in predictions) / n if n else 0.0)
        )

        viz_id = str(engine_idx)
        if viz_id in self._candidates:
            # Candidate already exists (typical for the seed, which gets its viz
            # record from on_optimization_start). Update in place.
            self._candidates[viz_id]["predictions"] = predictions
            self._candidates[viz_id]["score"] = score_value
            return

        # Seed fallback: if on_optimization_start didn't fire, we still want
        # the seed to land in the JSON. Seed is iteration=0 with engine_idx=0.
        iteration = event.get("iteration", -1)
        if iteration == 0 and engine_idx == 0:
            self._candidates["0"] = {
                "prompt": _flatten_prompt(event.get("candidate") or {}),
                "parent": None,
                "score": score_value,
                "predictions": predictions,
                "minibatch": None,
            }
            return

        # Accepted-candidate path: gepa fires on_valset_evaluated *before*
        # on_candidate_accepted, so the viz record doesn't exist yet. Park
        # the eval here; on_candidate_accepted will fold it in.
        self._pending_valset_eval[engine_idx] = {
            "predictions": predictions,
            "score": score_value,
        }

    # ----- helpers ------------------------------------------------------

    def _build_minibatch(self) -> list[dict[str, Any]]:
        ids = self._buf.minibatch_ids
        if not ids:
            return []
        entries: list[dict[str, Any]] = []
        for k, data_id in enumerate(ids):
            example = self._lookup_train_example(data_id)
            entries.append(
                {
                    "example": example,
                    "parent_prediction": _normalize_output(
                        self._buf.parent_outputs[k] if k < len(self._buf.parent_outputs) else None
                    )
                    or {},
                    "parent_score": float(
                        self._buf.parent_scores[k] if k < len(self._buf.parent_scores) else 0.0
                    ),
                    "prediction": _normalize_output(
                        self._buf.candidate_outputs[k] if k < len(self._buf.candidate_outputs) else None
                    )
                    or {},
                    "score": float(
                        self._buf.candidate_scores[k] if k < len(self._buf.candidate_scores) else 0.0
                    ),
                    "feedback": self._buf.feedback[k] if k < len(self._buf.feedback) else "",
                }
            )
        return entries

    def _lookup_train_example(self, data_id: Any) -> dict[str, Any]:
        # When trainset is a plain list, GEPA's default DataLoader uses integer DataIds.
        if isinstance(data_id, int) and 0 <= data_id < len(self._trainset):
            return _normalize_example(self._trainset[data_id])
        return {"data_id": repr(data_id)}

    def _write(self) -> None:
        atomic_write_json(
            self._path,
            {
                "examples": self._examples_serialized,
                "candidates": self._candidates,
            },
        )
