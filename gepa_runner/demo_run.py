"""Stream a small DSPy + GEPA spam-classification run into gepa-viz.

Usage:
    OPENAI_API_KEY=... uv run python demo_run.py
"""

from __future__ import annotations

import os
import random
from typing import Any

import dspy
from datasets import load_dataset
from dotenv import load_dotenv
from dspy import Prediction

from callback import GepaVizCallback
from spam_clasf import SpamClasif

load_dotenv()


TRAIN_N = 32
VAL_N = 16


def _coerce_label(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"spam", "1", "true", "yes"}
    return False


def _pick(row: dict[str, Any], *keys: str, default: str = "") -> str:
    for k in keys:
        if k in row and row[k] is not None:
            return str(row[k])
    return default


def make_examples(rows: list[dict[str, Any]], n: int) -> list[dspy.Example]:
    out: list[dspy.Example] = []
    for r in rows[:n]:
        subject = _pick(r, "subject", "Subject", "title")
        body = _pick(r, "body", "Body", "text", "Text", "message", "email")
        if not subject and not body:
            continue
        label = r.get(
            "label", r.get("Label", r.get("is_spam", r.get("spam", r.get("class"))))
        )
        is_spam = _coerce_label(label)
        ex = dspy.Example(
            subject=subject,
            body=body,
            is_spam=is_spam,
        ).with_inputs("subject", "body")
        out.append(ex)
    return out


def spam_metric(gold, pred, trace=None, pred_name=None, pred_trace=None) -> float:
    truth = bool(getattr(gold, "is_spam", False))
    guess = bool(getattr(pred, "is_spam", False))
    score = 1 if truth == guess else 0
    if score == 0:
        feedback = f"[INCORRECT], predicted ={guess}, expected={truth}"
    else:
        feedback = ""

    return Prediction(score=score, feedback=feedback)


def main() -> None:
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY env var is required for this demo.")

    lm = dspy.LM("openai/gpt-4o-mini", max_tokens=200)
    dspy.configure(lm=lm)

    ds = load_dataset("UniqueData/email-spam-classification")
    split = "train" if "train" in ds else next(iter(ds.keys()))
    rows = [dict(r) for r in ds[split]]
    random.Random(0).shuffle(rows)

    needed = TRAIN_N + VAL_N
    pool = make_examples(rows, needed * 3)
    if len(pool) < needed:
        raise SystemExit(
            f"Dataset only yielded {len(pool)} usable rows; expected at least {needed}."
        )
    trainset = pool[:TRAIN_N]
    valset = pool[TRAIN_N : TRAIN_N + VAL_N]

    student = dspy.Predict(SpamClasif)

    callback = GepaVizCallback(valset=valset, trainset=trainset)

    optimizer = dspy.GEPA(
        metric=spam_metric,
        auto="light",
        reflection_lm=lm,
        gepa_kwargs={"callbacks": [callback]},
    )
    optimizer.compile(student, trainset=trainset, valset=valset)
    print(f"done — run.json written to {callback._path}")


if __name__ == "__main__":
    main()
