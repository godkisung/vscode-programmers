export interface TestCase {
  inputs: unknown[];
  output: unknown;
}

export interface ParsedExample {
  ok: boolean;
  raw: string[];
  inputs?: unknown[];
  output?: unknown;
}

export interface ProblemData {
  id: string;
  title: string;
  /** Programmers 난이도(0~5). 페이지에서 찾지 못하면 null — 추정하지 않는다. */
  level: number | null;
  descriptionHtml: string;
  paramNames: string[];
  skeletonCode: string | null;
  examples: ParsedExample[];
}

export interface RunResult {
  index: number;
  pass: boolean;
  actual?: unknown;
  expected?: unknown;
  error?: string;
  timeMs?: number;
}

export interface SampleTestRun {
  results: RunResult[];
  debugOutput: string;
}
