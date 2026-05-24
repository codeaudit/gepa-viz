import { createContext } from "react";
import { EMPTY_RUN } from "../lib/run";
import type { Run } from "../lib/types";

export type RunCtx = {
  run: Run;
  error: string | null;
};

export const RunContext = createContext<RunCtx>({
  run: EMPTY_RUN,
  error: null,
});
