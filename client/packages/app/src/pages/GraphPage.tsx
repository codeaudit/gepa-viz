import { useNavigate } from "react-router-dom";
import { Graph, useRun } from "gepa-viz";

export default function GraphPage() {
  const navigate = useNavigate();
  const { run, error } = useRun();
  const empty = Object.keys(run.candidates).length === 0;

  return (
    <div className="w-screen h-screen overflow-hidden">
      {empty ? (
        <div className="flex h-full w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="rounded-md border border-zinc-300 bg-white px-6 py-5 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              gepa-viz
            </div>
            <div className="mt-2">waiting for a GEPA run…</div>
            <div className="mt-1 text-xs text-zinc-500">
              start one and the graph will appear here.
            </div>
            {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
          </div>
        </div>
      ) : (
        <Graph
          run={run}
          onCandidateClick={(id) => navigate(`/candidate/${id}`)}
        />
      )}
    </div>
  );
}
