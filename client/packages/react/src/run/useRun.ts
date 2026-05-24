import { useContext } from "react";
import { RunContext } from "./context";
import type { RunCtx } from "./context";

export function useRun(): RunCtx {
  return useContext(RunContext);
}
