"use client";

import { useSyncExternalStore } from "react";
import PromptDiff from "./PromptDiff";

const STORAGE_KEY = "gepa-viz:prompt-view";
type View = "prompt" | "diff";
const DEFAULT_VIEW: View = "diff";

// External store wired to localStorage so the toggle persists across navigations.
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): View {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "prompt" ? "prompt" : "diff";
}

function getServerSnapshot(): View {
  return DEFAULT_VIEW;
}

function setView(v: View) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  listeners.forEach((cb) => cb());
}

type Props = {
  prompt: string;
  parentPrompt: string | null;
};

export default function PromptSection({ prompt, parentPrompt }: Props) {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // No parent → no diff available. Just show the prompt with no toggle.
  if (parentPrompt === null) {
    return (
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          prompt
        </h2>
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed rounded-md border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          {prompt}
        </pre>
      </section>
    );
  }

  const showDiff = view === "diff";

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          prompt
        </h2>
        <Toggle view={view} onChange={setView} />
      </div>
      <div className="rounded-md border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        {showDiff ? (
          <PromptDiff before={parentPrompt} after={prompt} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
            {prompt}
          </pre>
        )}
      </div>
    </section>
  );
}

function Toggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const isDiff = view === "diff";
  const labelBase = "text-xs font-semibold uppercase tracking-wide";
  const active = "text-zinc-900 dark:text-zinc-100";
  const inactive = "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300";
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("prompt")}
        className={`${labelBase} ${!isDiff ? active : inactive}`}
        aria-pressed={!isDiff}
      >
        prompt
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={isDiff}
        onClick={() => onChange(isDiff ? "prompt" : "diff")}
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          isDiff ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform dark:bg-zinc-950 ${
            isDiff ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </button>
      <button
        type="button"
        onClick={() => onChange("diff")}
        className={`${labelBase} ${isDiff ? active : inactive}`}
        aria-pressed={isDiff}
      >
        diff
      </button>
    </div>
  );
}
