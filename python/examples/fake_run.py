"""Drive GepaVizCallback with synthetic GEPA events — no LLM, no API key.

Lets you exercise the viewer (embedded, remote, or static dump) quickly.

Embedded server (opens a browser tab, streams live):
    uv run python examples/fake_run.py

Stream into a standalone server (run `gepa-viz live` in another terminal first):
    uv run python examples/fake_run.py --endpoint http://127.0.0.1:5151

Headless dump only (then `gepa-viz serve --file run.json`):
    uv run python examples/fake_run.py --no-live --path run.json
"""

from __future__ import annotations

import argparse
import time

from gepa_viz import GepaVizCallback

VAL = [
    {"subject": "You won a prize", "body": "Click here", "is_spam": True},
    {"subject": "Lunch?", "body": "Free at noon", "is_spam": False},
    {"subject": "Invoice 4821", "body": "Payment due", "is_spam": False},
    {"subject": "Cheap meds", "body": "Buy now!!!", "is_spam": True},
    {"subject": "Standup notes", "body": "See doc", "is_spam": False},
    {"subject": "Account locked", "body": "Verify password", "is_spam": True},
]
TRAIN = [
    {"subject": "Re: project", "body": "Looks good", "is_spam": False},
    {"subject": "Win a car", "body": "Limited offer", "is_spam": True},
    {"subject": "Meeting moved", "body": "3pm now", "is_spam": False},
]


def valset_eval(candidate_idx: int, iteration: int, accuracy: float) -> dict:
    """Build an on_valset_evaluated event where the first N examples are right."""
    n_correct = round(accuracy * len(VAL))
    scores = {i: (1.0 if i < n_correct else 0.0) for i in range(len(VAL))}
    outputs = {i: {"is_spam": VAL[i]["is_spam"]} for i in range(len(VAL))}
    return {
        "candidate_idx": candidate_idx,
        "iteration": iteration,
        "scores_by_val_id": scores,
        "outputs_by_val_id": outputs,
        "average_score": sum(scores.values()) / len(VAL),
        "candidate": {"classify": f"instructions v{candidate_idx}"},
    }


def run_iteration(
    cb: GepaVizCallback,
    *,
    parent: int,
    new_idx: int,
    accept: bool,
    accuracy: float,
    delay: float,
) -> None:
    cb.on_iteration_start({})
    cb.on_candidate_selected({"candidate_idx": parent})
    cb.on_minibatch_sampled({"minibatch_ids": [0, 1, 2]})
    cb.on_evaluation_end({"outputs": [{"is_spam": False}] * 3, "scores": [1, 0, 1]})
    cb.on_evaluation_end({"outputs": [{"is_spam": True}] * 3, "scores": [1, 1, 1]})
    cb.on_reflective_dataset_built(
        {"dataset": {"classify": [{"Feedback": "be stricter"}] * 3}}
    )
    cb.on_proposal_end(
        {"new_instructions": {"classify": f"instructions v{new_idx} (parent {parent})"}}
    )
    if accept:
        cb.on_valset_evaluated(valset_eval(new_idx, new_idx, accuracy))
        cb.on_candidate_accepted({"new_candidate_idx": new_idx, "parent_ids": [parent]})
    else:
        cb.on_candidate_rejected({})
    cb.on_iteration_end({})
    time.sleep(delay)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--endpoint", default=None, help="Stream to a preexisting server.")
    ap.add_argument("--live", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--path", default=None, help="Where to dump run.json.")
    ap.add_argument("--delay", type=float, default=1.5, help="Seconds between iterations.")
    args = ap.parse_args()

    with GepaVizCallback(
        VAL,
        trainset=TRAIN,
        live=args.live,
        endpoint=args.endpoint,
        path=args.path,
    ) as cb:
        cb.on_optimization_start({"seed_candidate": {"classify": "classify the email"}})
        cb.on_valset_evaluated(valset_eval(0, 0, accuracy=0.5))
        time.sleep(args.delay)

        run_iteration(cb, parent=0, new_idx=1, accept=True, accuracy=0.67, delay=args.delay)
        run_iteration(cb, parent=0, new_idx=2, accept=False, accuracy=0.0, delay=args.delay)
        run_iteration(cb, parent=1, new_idx=3, accept=True, accuracy=0.83, delay=args.delay)

        print("fake run complete")


if __name__ == "__main__":
    main()
