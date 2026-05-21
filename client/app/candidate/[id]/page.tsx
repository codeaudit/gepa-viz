import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import MinibatchPanel from "../../components/MinibatchPanel";
import ParetoGrid from "../../components/ParetoGrid";
import PromptSection from "../../components/PromptSection";
import type { Run } from "../../lib/types";
import { EMPTY_RUN } from "../../lib/run";

export const dynamic = "force-dynamic";

type Params = { id: string };

async function loadRunFromDisk(): Promise<Run> {
  try {
    const file = await readFile(
      path.join(process.cwd(), "public", "run.json"),
      "utf-8",
    );
    return JSON.parse(file) as Run;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_RUN;
    throw err;
  }
}

export default async function CandidatePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const run = await loadRunFromDisk();
  const candidate = run.candidates[id];
  if (!candidate) notFound();
  const parent =
    candidate.parent !== null ? run.candidates[candidate.parent] : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <nav className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← back to graph
        </Link>
        <div className="text-xs text-zinc-500">
          {candidate.parent === null ? (
            <>root candidate</>
          ) : (
            <>parent: <Link href={`/candidate/${candidate.parent}`} className="underline">candidate {candidate.parent}</Link></>
          )}
        </div>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">candidate {id}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {candidate.score !== null
            ? `valset score: ${(candidate.score * 100).toFixed(2)}% (${valCorrect(candidate)}/${run.examples.length})`
            : "rejected on minibatch — not evaluated on valset"}
        </p>
      </header>

      <Section title="pareto frontier on valset">
        {candidate.predictions ? (
          <ParetoGrid
            examples={run.examples}
            predictions={candidate.predictions}
          />
        ) : (
          <div className="rounded-md border border-dashed border-zinc-400 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900">
            this candidate was rejected on its minibatch and was not evaluated on the
            valset, so it has no pareto frontier data.
          </div>
        )}
      </Section>

      <PromptSection
        prompt={candidate.prompt}
        parentPrompt={parent?.prompt ?? null}
      />

      {candidate.minibatch && (
        <Section title="reflection minibatch + feedback">
          <MinibatchPanel entries={candidate.minibatch} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function valCorrect(c: { predictions: { score: number }[] | null }): number {
  if (c.predictions === null) return 0;
  return c.predictions.filter((p) => p.score > 0).length;
}
