import type { Candidate, Run } from "./types";

export const EMPTY_RUN: Run = { examples: [], candidates: {} };

export async function fetchRun(): Promise<Run> {
  const res = await fetch("/run.json", { cache: "no-store" });
  if (res.status === 404) return EMPTY_RUN;
  if (!res.ok) throw new Error(`failed to fetch /run.json: ${res.status}`);
  return (await res.json()) as Run;
}

export function improved(c: Candidate): boolean {
  return c.predictions !== null;
}

export function paretoMask(c: Candidate): boolean[] | null {
  if (c.predictions === null) return null;
  return c.predictions.map((p) => p.score > 0);
}

export function children(r: Run, id: string): string[] {
  return Object.entries(r.candidates)
    .filter(([, c]) => c.parent === id)
    .map(([cid]) => cid);
}
