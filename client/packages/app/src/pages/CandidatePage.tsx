import { Link, useParams } from "react-router-dom";
import { CandidateView, useRun } from "gepa-viz";

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const { run } = useRun();

  if (!id) return <NotFound />;
  const candidate = run.candidates[id];
  if (!candidate) return <NotFound />;
  const parent =
    candidate.parent !== null ? run.candidates[candidate.parent] : null;

  return (
    <CandidateView
      id={id}
      candidate={candidate}
      parent={parent ?? null}
      examples={run.examples}
      renderLink={(to, children) => <Link to={to}>{children}</Link>}
    />
  );
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 text-sm text-zinc-600 dark:text-zinc-400">
      <Link
        to="/"
        className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← back to graph
      </Link>
      <p className="mt-6">candidate not found.</p>
    </div>
  );
}
