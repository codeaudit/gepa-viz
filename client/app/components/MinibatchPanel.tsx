import type { MinibatchEntry } from "../lib/types";
import { exampleInputs } from "../lib/types";
import { toYaml } from "../lib/yaml";
import PromptDiff from "./PromptDiff";
import Yaml from "./Yaml";

type Props = {
  entries: MinibatchEntry[];
};

export default function MinibatchPanel({ entries }: Props) {
  return (
    <div className="space-y-6">
      {entries.map((m, i) => {
        const delta = m.score - m.parent_score;
        const inputs = exampleInputs(m.example);
        const groundTruth = m.example.ground_truth;
        return (
          <div
            key={i}
            className="rounded-md border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                minibatch example {i + 1}
              </div>
              <div className="text-xs">
                parent {m.parent_score.toFixed(2)} → candidate {m.score.toFixed(2)}
                <span
                  className={
                    delta > 0
                      ? "ml-2 text-green-700 dark:text-green-400"
                      : delta < 0
                      ? "ml-2 text-red-700 dark:text-red-400"
                      : "ml-2 text-zinc-500"
                  }
                >
                  {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                </span>
              </div>
            </div>

            <Field label="example">
              <Yaml value={inputs} />
            </Field>

            <Field label="prediction (parent → candidate)">
              <PromptDiff
                before={toYaml(m.parent_prediction)}
                after={toYaml(m.prediction)}
              />
            </Field>

            <Field label="ground truth">
              {groundTruth ? (
                <Yaml value={groundTruth} />
              ) : (
                <span className="text-xs text-zinc-500">none</span>
              )}
            </Field>

            <Field label="feedback">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                {m.feedback}
              </pre>
            </Field>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}
