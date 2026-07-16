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
}

export interface SampleTestRun {
  results: RunResult[];
  debugOutput: string;
}
