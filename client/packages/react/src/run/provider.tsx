import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EMPTY_RUN, fetchRun } from "../lib/run";
import type { Run } from "../lib/types";
import { RunContext } from "./context";

const DEFAULT_POLL_MS = 1000;

export function RunProvider({
  children,
  src = "/run.json",
  pollMs = DEFAULT_POLL_MS,
}: {
  children: ReactNode;
  src?: string;
  pollMs?: number;
}) {
  const [run, setRun] = useState<Run>(EMPTY_RUN);
  const [error, setError] = useState<string | null>(null);
  const lastSerialized = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchRun(src);
        const serialized = JSON.stringify(next);
        if (!cancelled && serialized !== lastSerialized.current) {
          lastSerialized.current = serialized;
          setRun(next);
        }
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [src, pollMs]);

  return (
    <RunContext.Provider value={{ run, error }}>{children}</RunContext.Provider>
  );
}
