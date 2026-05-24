import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EMPTY_RUN, fetchRun } from "../lib/run";
import type { Run } from "../lib/types";
import { RunContext } from "./context";

const DEFAULT_POLL_MS = 1000;

type Mode = "live" | "static" | "poll";

// The server tells us how to load data via /config.json:
//   live   -> subscribe to /events (SSE), replace state on every push
//   static -> fetch /run.json once (a dumped run, `gepa-viz serve --file`)
// If /config.json is absent (e.g. the Vite dev server), fall back to polling
// /run.json so `npm run dev` keeps working.
async function resolveMode(): Promise<Mode> {
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) return "poll";
    const cfg = (await res.json()) as { mode?: Mode };
    return cfg.mode === "live" || cfg.mode === "static" ? cfg.mode : "poll";
  } catch {
    return "poll";
  }
}

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
    let interval: ReturnType<typeof setInterval> | undefined;
    let source: EventSource | undefined;

    const applyRun = (next: Run) => {
      const serialized = JSON.stringify(next);
      if (cancelled || serialized === lastSerialized.current) return;
      lastSerialized.current = serialized;
      setRun(next);
    };

    const startLive = () => {
      source = new EventSource("/events");
      source.onmessage = (e) => {
        try {
          applyRun(JSON.parse(e.data) as Run);
          if (!cancelled) setError(null);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      };
      // EventSource auto-reconnects; surface the gap but don't tear down.
      source.onerror = () => {
        if (!cancelled) setError("live stream disconnected — reconnecting…");
      };
    };

    const fetchOnce = async () => {
      try {
        applyRun(await fetchRun(src));
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    const startPolling = () => {
      fetchOnce();
      interval = setInterval(fetchOnce, pollMs);
    };

    resolveMode().then((mode) => {
      if (cancelled) return;
      if (mode === "live") startLive();
      else if (mode === "static") fetchOnce();
      else startPolling();
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (source) source.close();
    };
  }, [src, pollMs]);

  return (
    <RunContext.Provider value={{ run, error }}>{children}</RunContext.Provider>
  );
}
