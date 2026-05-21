export type PredictionValue = Record<string, unknown>;

export type Example = Record<string, unknown> & {
  ground_truth?: PredictionValue;
};

export type Prediction = {
  prediction: PredictionValue;
  score: number;
};

export type MinibatchEntry = {
  example: Example;
  parent_prediction: PredictionValue;
  parent_score: number;
  prediction: PredictionValue;
  score: number;
  feedback: string;
};

export type Candidate = {
  prompt: string;
  parent: string | null;
  score: number | null;
  predictions: Prediction[] | null;
  minibatch: MinibatchEntry[] | null;
};

export type Run = {
  examples: Example[];
  candidates: Record<string, Candidate>;
};

export const GROUND_TRUTH_KEY = "ground_truth" as const;

export function exampleInputs(example: Example): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(example)) {
    if (k !== GROUND_TRUTH_KEY) rest[k] = v;
  }
  return rest;
}
