import { useState } from "react";
import type { Example, Prediction } from "../lib/types";
import { exampleInputs } from "../lib/types";
import Yaml from "./Yaml";

type Props = {
  examples: Example[];
  predictions: Prediction[];
  cell?: number;
  gap?: number;
};

export default function ParetoGrid({ examples, predictions, cell = 28, gap = 4 }: Props) {
  const n = predictions.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  // Hover gives a transient preview; pinned is the sticky selection.
  // Hover wins when present so you can peek without losing your pin.
  const focusedIdx = hovered ?? pinned;
  const focused = focusedIdx !== null ? examples[focusedIdx] : null;
  const focusedInputs = focused ? exampleInputs(focused) : null;
  const focusedGroundTruth = focused?.ground_truth;
  const focusedPrediction = focusedIdx !== null ? predictions[focusedIdx] : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          gridTemplateRows: `repeat(${rows}, ${cell}px)`,
          gap: `${gap}px`,
        }}
      >
        {predictions.map((p, i) => {
          const ok = p.score > 0;
          const isPinned = pinned === i;
          return (
            <button
              type="button"
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              onClick={() => setPinned((p) => (p === i ? null : i))}
              className={`rounded-sm transition-transform hover:scale-110 focus:scale-110 outline-none focus:ring-2 focus:ring-zinc-400 ${
                ok ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"
              } ${
                isPinned
                  ? "ring-2 ring-offset-2 ring-zinc-900 ring-offset-white dark:ring-zinc-100 dark:ring-offset-zinc-950"
                  : ""
              }`}
              style={{ width: cell, height: cell }}
              aria-label={`example ${i}, score ${p.score}${isPinned ? " (pinned)" : ""}`}
              aria-pressed={isPinned}
            />
          );
        })}
      </div>

      <div className="h-96 overflow-auto rounded-md border border-zinc-300 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
        {focusedIdx === null || !focusedPrediction || !focusedInputs ? (
          <div className="text-zinc-500">
            hover, focus, or click a pixel to inspect that example. click again to unpin.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                valset example {focusedIdx}
                {pinned === focusedIdx && (
                  <span className="ml-2 rounded-sm bg-zinc-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
                    pinned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>
                  score{" "}
                  <span
                    className={
                      focusedPrediction.score > 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    {focusedPrediction.score.toFixed(2)}
                  </span>
                </span>
                {pinned !== null && (
                  <button
                    type="button"
                    onClick={() => setPinned(null)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    unpin
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                example
              </div>
              <Yaml value={focusedInputs} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div
                className={`rounded-md border p-2 ${
                  focusedPrediction.score > 0
                    ? "border-green-400/70 dark:border-green-700"
                    : "border-red-400/70 dark:border-red-800"
                } bg-zinc-50 dark:bg-zinc-950`}
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  prediction
                </div>
                <Yaml value={focusedPrediction.prediction} />
              </div>
              <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  ground truth
                </div>
                {focusedGroundTruth ? (
                  <Yaml value={focusedGroundTruth} />
                ) : (
                  <span className="text-xs text-zinc-500">none</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
