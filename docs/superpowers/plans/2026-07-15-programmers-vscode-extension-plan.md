# Programmers VS Code Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that lets a user fetch a Programmers problem, solve it locally in Python, and run it against the problem's own example cases — without leaving the editor.

**Architecture:** A TypeScript VS Code extension with a strict split between pure, unit-testable "core" logic (HTML/case parsing, file scaffolding, HTTP header building, Python-harness invocation, webview HTML rendering) and a thin `extension.ts` glue layer that wires core modules to VS Code commands, `SecretStorage`, and the filesystem. Local test execution shells out to a small static Python script (`resources/runner.py`) that imports the user's `solution.py` and calls `solution(*args)` per example case.

**Tech Stack:** TypeScript, VS Code Extension API, Jest + ts-jest, cheerio (HTML parsing), sanitize-html (webview sanitization), Python 3 (local test harness, invoked via `child_process.spawnSync`).

## Global Constraints

- Target language for solving problems: Python 3 only (per spec — Phase 1 scope)
- Auto-submit to Programmers (Phase 2) is explicitly out of scope for this plan — this plan only covers fetch + local sample-test execution
- Session cookie must be stored via VS Code `SecretStorage`, never in plain `settings.json`
- No custom user-added test cases in this phase — only the problem's own example cases are run locally
- All requests to Programmers must send a consistent `User-Agent` header alongside the cookie
- The real HTML/markup structure of school.programmers.co.kr has **not** been verified against the live site during planning (no authenticated access available). Parser selectors are best-effort placeholders and MUST be validated/corrected against a real page in Task 9.

---

## Task 1: Project scaffolding & build/test pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `src/extension.ts`

**Interfaces:**
- Produces: an `activate(context: vscode.ExtensionContext)` / `deactivate()` pair in `src/extension.ts` that later tasks will extend (Task 8 rewrites the body of `activate`).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "programmers-helper",
  "displayName": "Programmers Helper",
  "description": "Solve Programmers coding test problems locally in VS Code",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": []
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "jest"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "@types/jest": "^29.5.0",
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  passWithNoTests: true,
};
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
out/
*.vsix
.vscode-test/
```

- [ ] **Step 5: Write `src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Commands are registered in a later task.
}

export function deactivate() {}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes with no errors, creates `node_modules/` and `package-lock.json`

- [ ] **Step 7: Verify the extension compiles**

Run: `npm run compile`
Expected: exits 0, creates `out/extension.js`

- [ ] **Step 8: Verify the test pipeline runs (no tests yet)**

Run: `npm test`
Expected: exits 0, reports no tests found (allowed by `passWithNoTests`)

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json jest.config.js .gitignore src/extension.ts package-lock.json
git commit -m "chore: scaffold VS Code extension project with build/test pipeline"
```

---

## Task 2: Example-case value parser

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/caseParser.ts`
- Test: `test/core/caseParser.test.ts`

**Interfaces:**
- Produces (in `types.ts`): `TestCase { inputs: unknown[]; output: unknown }`, `ParsedExample { ok: boolean; raw: string[]; inputs?: unknown[]; output?: unknown }`, `ProblemData { id: string; title: string; descriptionHtml: string; paramNames: string[]; skeletonCode: string | null; examples: ParsedExample[] }`, `RunResult { index: number; pass: boolean; actual?: unknown; expected?: unknown; error?: string }`
- Produces (in `caseParser.ts`): `parseCaseValue(text: string): CaseValueResult` where `CaseValueResult = { ok: true; value: unknown } | { ok: false; raw: string }`

- [ ] **Step 1: Write `src/core/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `test/core/caseParser.test.ts`**

```ts
import { parseCaseValue } from '../../src/core/caseParser';

describe('parseCaseValue', () => {
  test('parses a JSON array directly', () => {
    expect(parseCaseValue('[1, 2, 3]')).toEqual({ ok: true, value: [1, 2, 3] });
  });

  test('parses a double-quoted JSON string directly', () => {
    expect(parseCaseValue('"abcdef"')).toEqual({ ok: true, value: 'abcdef' });
  });

  test('parses lowercase JSON booleans directly', () => {
    expect(parseCaseValue('true')).toEqual({ ok: true, value: true });
  });

  test('falls back to normalize single-quoted strings', () => {
    expect(parseCaseValue("['a', 'b', 'c']")).toEqual({ ok: true, value: ['a', 'b', 'c'] });
  });

  test('falls back to normalize Python-style True/False/None', () => {
    expect(parseCaseValue('[True, False, None]')).toEqual({ ok: true, value: [true, false, null] });
  });

  test('parses nested arrays', () => {
    expect(parseCaseValue('[[1, 2], [3, 4]]')).toEqual({ ok: true, value: [[1, 2], [3, 4]] });
  });

  test('returns ok:false for unparseable text', () => {
    const result = parseCaseValue('not { a valid } value [');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest test/core/caseParser.test.ts`
Expected: FAIL with "Cannot find module '../../src/core/caseParser'"

- [ ] **Step 4: Write `src/core/caseParser.ts`**

```ts
export type CaseValueResult =
  | { ok: true; value: unknown }
  | { ok: false; raw: string };

export function parseCaseValue(text: string): CaseValueResult {
  const trimmed = text.trim();

  const direct = tryJsonParse(trimmed);
  if (direct.ok) return direct;

  const normalized = trimmed
    .replace(/'/g, '"')
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false');
  const fallback = tryJsonParse(normalized);
  if (fallback.ok) return fallback;

  return { ok: false, raw: trimmed };
}

function tryJsonParse(text: string): CaseValueResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, raw: text };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest test/core/caseParser.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/caseParser.ts test/core/caseParser.test.ts
git commit -m "feat: add example-case value parser with JSON-first, literal-fallback strategy"
```

---

## Task 3: Problem HTML parser

**Files:**
- Create: `src/core/parser.ts`
- Create: `test/fixtures/sample-problem.html`
- Test: `test/core/parser.test.ts`

**Interfaces:**
- Consumes: `ParsedExample`, `ProblemData` from `src/core/types.ts` (Task 2); `parseCaseValue` from `src/core/caseParser.ts` (Task 2)
- Produces: `parseProblemHtml(html: string, id: string): ProblemData`

**Important note:** The CSS selectors below (`TITLE_SELECTORS`, `DESCRIPTION_SELECTORS`, `SKELETON_SELECTORS`, `EXAMPLE_TABLE_SELECTORS`) are best-effort guesses — nobody on this task has authenticated access to school.programmers.co.kr to confirm real markup. They are deliberately structured as ordered candidate lists in one place so Task 9 (manual verification against the live site) can correct them without touching the parsing logic.

- [ ] **Step 1: Install cheerio**

Run: `npm install cheerio`
Expected: adds `cheerio` to `dependencies` in `package.json`

- [ ] **Step 2: Write the fixture `test/fixtures/sample-problem.html`**

```html
<!DOCTYPE html>
<html>
<body>
  <h4 class="algorithm-title">완주하지 못한 선수</h4>
  <div class="guide-section-description">
    <p>수많은 마라톤 선수들이 마라톤에 참여하였습니다.</p>
  </div>
  <pre class="skeleton-code">def solution(participant, completion):
    answer = ''
    return answer</pre>
  <table class="table">
    <thead>
      <tr><th>participant</th><th>completion</th><th>result</th></tr>
    </thead>
    <tbody>
      <tr><td>["leo", "kiki", "eden"]</td><td>["eden", "kiki"]</td><td>"leo"</td></tr>
      <tr><td>["marina", "josipa", "nikola", "vinko", "filipa"]</td><td>["josipa", "filipa", "marina", "nikola"]</td><td>"vinko"</td></tr>
    </tbody>
  </table>
</body>
</html>
```

- [ ] **Step 3: Write the failing test `test/core/parser.test.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { parseProblemHtml } from '../../src/core/parser';

describe('parseProblemHtml', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'sample-problem.html'),
    'utf-8'
  );

  test('extracts the title', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.title).toBe('완주하지 못한 선수');
  });

  test('extracts the description html', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.descriptionHtml).toContain('마라톤');
  });

  test('extracts the skeleton code', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.skeletonCode).toContain('def solution(participant, completion):');
  });

  test('extracts parameter names from the example table header', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.paramNames).toEqual(['participant', 'completion']);
  });

  test('extracts and parses example rows', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.examples).toHaveLength(2);
    expect(data.examples[0]).toEqual({
      ok: true,
      raw: ['["leo", "kiki", "eden"]', '["eden", "kiki"]', '"leo"'],
      inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']],
      output: 'leo',
    });
  });

  test('falls back to a default title and empty examples when nothing matches', () => {
    const data = parseProblemHtml('<html><body></body></html>', '1');
    expect(data.title).toBe('Problem 1');
    expect(data.examples).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest test/core/parser.test.ts`
Expected: FAIL with "Cannot find module '../../src/core/parser'"

- [ ] **Step 5: Write `src/core/parser.ts`**

```ts
import * as cheerio from 'cheerio';
import { ProblemData, ParsedExample } from './types';
import { parseCaseValue, CaseValueResult } from './caseParser';

const TITLE_SELECTORS = ['.algorithm-title', 'h4.tit-area', 'h1'];
const DESCRIPTION_SELECTORS = ['.guide-section-description', '.markdown', 'article'];
const SKELETON_SELECTORS = ['#code', 'textarea#code_editor', 'pre.skeleton-code'];
const EXAMPLE_TABLE_SELECTORS = ['table.table', 'div.example table', 'table'];

export function parseProblemHtml(html: string, id: string): ProblemData {
  const $ = cheerio.load(html);

  const title = firstMatchText($, TITLE_SELECTORS) ?? `Problem ${id}`;
  const descriptionHtml = firstMatchHtml($, DESCRIPTION_SELECTORS) ?? '';
  const skeletonCode = firstMatchText($, SKELETON_SELECTORS) ?? null;
  const { paramNames, examples } = parseExampleTable($, EXAMPLE_TABLE_SELECTORS);

  return { id, title, descriptionHtml, paramNames, skeletonCode, examples };
}

function firstMatchText($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim()) return el.text().trim();
  }
  return null;
}

function firstMatchHtml($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    const html = el.html();
    if (el.length && html?.trim()) return html.trim();
  }
  return null;
}

function parseExampleTable(
  $: cheerio.CheerioAPI,
  selectors: string[]
): { paramNames: string[]; examples: ParsedExample[] } {
  for (const sel of selectors) {
    const table = $(sel).first();
    if (!table.length) continue;

    const headers = table
      .find('thead tr th')
      .map((_, th) => $(th).text().trim())
      .get();
    if (headers.length === 0) continue;

    const paramNames = headers.slice(0, -1);
    const examples: ParsedExample[] = [];

    table.find('tbody tr').each((_, tr) => {
      const cells = $(tr)
        .find('td')
        .map((_, td) => $(td).text().trim())
        .get();
      if (cells.length !== headers.length) return;

      const parsedInputs: CaseValueResult[] = cells.slice(0, -1).map(parseCaseValue);
      const parsedOutput = parseCaseValue(cells[cells.length - 1]);
      const ok = parsedInputs.every((p) => p.ok) && parsedOutput.ok;

      examples.push({
        ok,
        raw: cells,
        inputs: ok ? parsedInputs.map((p) => (p as { ok: true; value: unknown }).value) : undefined,
        output: ok ? (parsedOutput as { ok: true; value: unknown }).value : undefined,
      });
    });

    if (examples.length > 0) return { paramNames, examples };
  }
  return { paramNames: [], examples: [] };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest test/core/parser.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/parser.ts test/fixtures/sample-problem.html test/core/parser.test.ts package.json package-lock.json
git commit -m "feat: add problem HTML parser with candidate-selector fallback strategy"
```

---

## Task 4: Workspace file scaffolding

**Files:**
- Create: `src/core/scaffold.ts`
- Test: `test/core/scaffold.test.ts`

**Interfaces:**
- Consumes: `ProblemData`, `ParsedExample` from `src/core/types.ts` (Task 2)
- Produces: `buildSolutionFile(problem: ProblemData): string`, `buildCasesFile(problem: ProblemData): string`

- [ ] **Step 1: Write the failing test `test/core/scaffold.test.ts`**

```ts
import { buildSolutionFile, buildCasesFile } from '../../src/core/scaffold';
import { ProblemData } from '../../src/core/types';

const problem: ProblemData = {
  id: '42862',
  title: '완주하지 못한 선수',
  descriptionHtml: '<p>desc</p>',
  paramNames: ['participant', 'completion'],
  skeletonCode: "def solution(participant, completion):\n    answer = ''\n    return answer",
  examples: [
    {
      ok: true,
      raw: ['a', 'b', 'c'],
      inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']],
      output: 'leo',
    },
    { ok: false, raw: ['bad', 'data', 'here'] },
  ],
};

describe('buildSolutionFile', () => {
  test('includes a header comment with the title and URL', () => {
    const content = buildSolutionFile(problem);
    expect(content).toContain('완주하지 못한 선수');
    expect(content).toContain('https://school.programmers.co.kr/learn/courses/30/lessons/42862');
  });

  test('uses the parsed skeleton code when available', () => {
    const content = buildSolutionFile(problem);
    expect(content).toContain('def solution(participant, completion):');
  });

  test('falls back to a generated stub when no skeleton is available', () => {
    const content = buildSolutionFile({ ...problem, skeletonCode: null });
    expect(content).toContain('def solution(participant, completion):\n    pass');
  });
});

describe('buildCasesFile', () => {
  test('serializes only successfully parsed examples', () => {
    const content = JSON.parse(buildCasesFile(problem));
    expect(content).toEqual([
      { inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']], output: 'leo' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/core/scaffold.test.ts`
Expected: FAIL with "Cannot find module '../../src/core/scaffold'"

- [ ] **Step 3: Write `src/core/scaffold.ts`**

```ts
import { ProblemData, ParsedExample } from './types';

export function buildSolutionFile(problem: ProblemData): string {
  const header = `# ${problem.title}\n# https://school.programmers.co.kr/learn/courses/30/lessons/${problem.id}\n`;
  const body = problem.skeletonCode ?? `def solution(${problem.paramNames.join(', ')}):\n    pass\n`;
  return `${header}\n${body}\n`;
}

export function buildCasesFile(problem: ProblemData): string {
  const cases = problem.examples
    .filter((example): example is Required<ParsedExample> => example.ok)
    .map((example) => ({ inputs: example.inputs, output: example.output }));
  return JSON.stringify(cases, null, 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/core/scaffold.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/scaffold.ts test/core/scaffold.test.ts
git commit -m "feat: add solution.py / cases.json scaffolding from parsed problem data"
```

---

## Task 5: Python test harness + runner wrapper

**Prerequisite:** Python 3 must be installed on the machine running these tests. Run `python3 --version` first; if it fails, install Python 3.8+ before continuing.

**Files:**
- Create: `resources/runner.py`
- Create: `src/core/testRunner.ts`
- Create: `test/fixtures/sample-solution.py`
- Create: `test/fixtures/broken-solution.py`
- Create: `test/fixtures/sample-cases.json`
- Test: `test/core/testRunner.test.ts`

**Interfaces:**
- Consumes: `RunResult` from `src/core/types.ts` (Task 2)
- Produces: `runSampleTests(solutionPath: string, casesPath: string): RunResult[]`

- [ ] **Step 1: Write `resources/runner.py`**

```python
import importlib.util
import json
import sys


def load_solution(path):
    spec = importlib.util.spec_from_file_location("solution", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.solution


def main():
    solution_path = sys.argv[1]
    cases_path = sys.argv[2]

    with open(cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    solution = load_solution(solution_path)

    results = []
    for index, case in enumerate(cases):
        try:
            actual = solution(*case["inputs"])
            results.append({
                "index": index,
                "pass": actual == case["output"],
                "actual": actual,
                "expected": case["output"],
            })
        except Exception as exc:
            results.append({
                "index": index,
                "pass": False,
                "error": f"{type(exc).__name__}: {exc}",
            })

    print(json.dumps(results))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the fixtures**

`test/fixtures/sample-solution.py`:

```python
def solution(participant, completion):
    from collections import Counter
    counter = Counter(participant) - Counter(completion)
    return list(counter.keys())[0]
```

`test/fixtures/broken-solution.py`:

```python
def solution(participant, completion):
    return undefined_name
```

`test/fixtures/sample-cases.json`:

```json
[
  { "inputs": [["leo", "kiki", "eden"], ["eden", "kiki"]], "output": "leo" },
  { "inputs": [["a", "a", "b"], ["a", "b"]], "output": "a" }
]
```

- [ ] **Step 3: Write the failing test `test/core/testRunner.test.ts`**

```ts
import * as path from 'path';
import { runSampleTests } from '../../src/core/testRunner';

describe('runSampleTests', () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  test('runs the solution against each case and reports pass/fail', () => {
    const results = runSampleTests(
      path.join(fixturesDir, 'sample-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results).toEqual([
      { index: 0, pass: true, actual: 'leo', expected: 'leo' },
      { index: 1, pass: true, actual: 'a', expected: 'a' },
    ]);
  });

  test('reports a runtime exception without crashing the whole run', () => {
    const results = runSampleTests(
      path.join(fixturesDir, 'broken-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results[0].pass).toBe(false);
    expect(results[0].error).toContain('NameError');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest test/core/testRunner.test.ts`
Expected: FAIL with "Cannot find module '../../src/core/testRunner'"

- [ ] **Step 5: Write `src/core/testRunner.ts`**

```ts
import { spawnSync } from 'child_process';
import * as path from 'path';
import { RunResult } from './types';

const RUNNER_PATH = path.join(__dirname, '..', '..', 'resources', 'runner.py');

export function runSampleTests(solutionPath: string, casesPath: string): RunResult[] {
  const result = spawnSync('python3', [RUNNER_PATH, solutionPath, casesPath], {
    encoding: 'utf-8',
  });

  if (result.error) {
    throw new Error(`python3 실행에 실패했습니다: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`runner.py가 오류로 종료되었습니다:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest test/core/testRunner.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add resources/runner.py src/core/testRunner.ts test/fixtures/sample-solution.py test/fixtures/broken-solution.py test/fixtures/sample-cases.json test/core/testRunner.test.ts
git commit -m "feat: add Python sample-test harness and TS runner wrapper"
```

---

## Task 6: HTTP headers, problem fetch, and session check

**Files:**
- Create: `src/core/httpHeaders.ts`
- Create: `src/core/fetchProblem.ts`
- Test: `test/core/httpHeaders.test.ts`
- Test: `test/core/fetchProblem.test.ts`

**Interfaces:**
- Produces: `buildHeaders(cookie: string): Record<string, string>`, `USER_AGENT: string` (in `httpHeaders.ts`)
- Produces: `fetchProblemHtml(problemId: string, cookie: string, baseUrl?: string): Promise<string>`, `checkSession(cookie: string, baseUrl?: string): Promise<boolean>`, `class AuthExpiredError extends Error` (in `fetchProblem.ts`)

- [ ] **Step 1: Write the failing test `test/core/httpHeaders.test.ts`**

```ts
import { buildHeaders, USER_AGENT } from '../../src/core/httpHeaders';

describe('buildHeaders', () => {
  test('includes the cookie and a consistent user agent', () => {
    const headers = buildHeaders('_fss_session=abc123');
    expect(headers.Cookie).toBe('_fss_session=abc123');
    expect(headers['User-Agent']).toBe(USER_AGENT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/core/httpHeaders.test.ts`
Expected: FAIL with "Cannot find module '../../src/core/httpHeaders'"

- [ ] **Step 3: Write `src/core/httpHeaders.ts`**

```ts
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function buildHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    'User-Agent': USER_AGENT,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/core/httpHeaders.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing test `test/core/fetchProblem.test.ts`**

```ts
import * as http from 'http';
import { AddressInfo } from 'net';
import { fetchProblemHtml, checkSession, AuthExpiredError } from '../../src/core/fetchProblem';

describe('fetchProblemHtml / checkSession', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequestHeaders: http.IncomingHttpHeaders = {};

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      lastRequestHeaders = req.headers;
      if (req.url === '/learn/courses/30/lessons/1') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>ok</body></html>');
      } else if (req.url === '/learn/courses/30/lessons/expired') {
        res.writeHead(302, { Location: '/login' });
        res.end();
      } else if (req.url === '/learn/courses/30/lessons') {
        res.writeHead(200);
        res.end('ok');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('fetches the problem html and sends the cookie header', async () => {
    const html = await fetchProblemHtml('1', '_fss_session=abc', baseUrl);
    expect(html).toContain('ok');
    expect(lastRequestHeaders.cookie).toBe('_fss_session=abc');
  });

  test('throws AuthExpiredError on a login redirect', async () => {
    await expect(
      fetchProblemHtml('expired', '_fss_session=abc', baseUrl)
    ).rejects.toBeInstanceOf(AuthExpiredError);
  });

  test('checkSession returns true for a 200 response', async () => {
    await expect(checkSession('_fss_session=abc', baseUrl)).resolves.toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest test/core/fetchProblem.test.ts`
Expected: FAIL with "Cannot find module '../../src/core/fetchProblem'"

- [ ] **Step 7: Write `src/core/fetchProblem.ts`**

```ts
import { buildHeaders } from './httpHeaders';

export class AuthExpiredError extends Error {
  constructor() {
    super('Programmers 세션이 만료되었거나 로그인이 필요합니다.');
    this.name = 'AuthExpiredError';
  }
}

export async function fetchProblemHtml(
  problemId: string,
  cookie: string,
  baseUrl = 'https://school.programmers.co.kr'
): Promise<string> {
  const url = `${baseUrl}/learn/courses/30/lessons/${problemId}`;
  const response = await fetch(url, {
    headers: buildHeaders(cookie),
    redirect: 'manual',
  });

  if (response.status === 401 || (response.status >= 300 && response.status < 400)) {
    throw new AuthExpiredError();
  }

  if (!response.ok) {
    throw new Error(`문제를 불러오지 못했습니다 (HTTP ${response.status})`);
  }

  return response.text();
}

export async function checkSession(
  cookie: string,
  baseUrl = 'https://school.programmers.co.kr'
): Promise<boolean> {
  const response = await fetch(`${baseUrl}/learn/courses/30/lessons`, {
    headers: buildHeaders(cookie),
    redirect: 'manual',
  });
  return response.status >= 200 && response.status < 300;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest test/core/fetchProblem.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add src/core/httpHeaders.ts src/core/fetchProblem.ts test/core/httpHeaders.test.ts test/core/fetchProblem.test.ts
git commit -m "feat: add cookie-authenticated problem fetch and session check"
```

---

## Task 7: Webview HTML renderer

**Files:**
- Create: `src/webview/render.ts`
- Test: `test/webview/render.test.ts`

**Interfaces:**
- Consumes: `ProblemData` from `src/core/types.ts` (Task 2)
- Produces: `renderProblemHtml(problem: ProblemData): string`

- [ ] **Step 1: Install sanitize-html**

Run: `npm install sanitize-html && npm install --save-dev @types/sanitize-html`
Expected: adds `sanitize-html` to `dependencies` and `@types/sanitize-html` to `devDependencies`

- [ ] **Step 2: Write the failing test `test/webview/render.test.ts`**

```ts
import { renderProblemHtml } from '../../src/webview/render';
import { ProblemData } from '../../src/core/types';

const problem: ProblemData = {
  id: '42862',
  title: '완주하지 못한 선수',
  descriptionHtml: '<p>설명 <img src="/images/a.png"><script>alert(1)</script></p>',
  paramNames: [],
  skeletonCode: null,
  examples: [],
};

describe('renderProblemHtml', () => {
  test('escapes the title', () => {
    const html = renderProblemHtml({ ...problem, title: '<b>x</b>' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  test('strips script tags from the description', () => {
    const html = renderProblemHtml(problem);
    expect(html).not.toContain('<script>');
  });

  test('rewrites relative image src to an absolute url', () => {
    const html = renderProblemHtml(problem);
    expect(html).toContain('src="https://school.programmers.co.kr/images/a.png"');
  });

  test('includes a link back to the original problem page', () => {
    const html = renderProblemHtml(problem);
    expect(html).toContain(
      'href="https://school.programmers.co.kr/learn/courses/30/lessons/42862"'
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest test/webview/render.test.ts`
Expected: FAIL with "Cannot find module '../../src/webview/render'"

- [ ] **Step 4: Write `src/webview/render.ts`**

```ts
import sanitizeHtml from 'sanitize-html';
import { ProblemData } from '../core/types';

const ORIGIN = 'https://school.programmers.co.kr';

export function renderProblemHtml(problem: ProblemData): string {
  const sanitized = sanitizeHtml(problem.descriptionHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt'],
      a: ['href'],
    },
    transformTags: {
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, src: toAbsoluteUrl(attribs.src) },
      }),
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, href: toAbsoluteUrl(attribs.href) },
      }),
    },
  });

  const originalUrl = `${ORIGIN}/learn/courses/30/lessons/${problem.id}`;

  return `
    <h1>${escapeHtml(problem.title)}</h1>
    <div>${sanitized}</div>
    <p><a href="${originalUrl}">원본 페이지에서 보기</a></p>
  `;
}

function toAbsoluteUrl(url: string | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return new URL(url, ORIGIN).toString();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest test/webview/render.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/webview/render.ts test/webview/render.test.ts package.json package-lock.json
git commit -m "feat: add sanitized, absolute-URL-rewriting webview renderer"
```

---

## Task 8: Extension command wiring

**Files:**
- Create: `src/secretsStore.ts`
- Modify: `src/extension.ts` (replace the `activate` body from Task 1)
- Modify: `package.json` (add `contributes.commands`)

**Interfaces:**
- Consumes: `getCookie`/`setCookie` (own module), `fetchProblemHtml`/`checkSession`/`AuthExpiredError` from `src/core/fetchProblem.ts` (Task 6), `parseProblemHtml` from `src/core/parser.ts` (Task 3), `buildSolutionFile`/`buildCasesFile` from `src/core/scaffold.ts` (Task 4), `runSampleTests` from `src/core/testRunner.ts` (Task 5), `renderProblemHtml` from `src/webview/render.ts` (Task 7)
- Produces: registered commands `programmers.setSessionCookie`, `programmers.checkConnection`, `programmers.openProblem`, `programmers.runSampleTests`

This task is VS Code API glue and is not unit-tested with Jest (the VS Code API isn't available outside the extension host). It's verified manually via the Extension Development Host in Step 5 below.

- [ ] **Step 1: Write `src/secretsStore.ts`**

```ts
import * as vscode from 'vscode';

const COOKIE_KEY = 'programmers.sessionCookie';

export async function getCookie(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(COOKIE_KEY);
}

export async function setCookie(secrets: vscode.SecretStorage, cookie: string): Promise<void> {
  await secrets.store(COOKIE_KEY, cookie);
}
```

- [ ] **Step 2: Replace `src/extension.ts`**

```ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCookie, setCookie } from './secretsStore';
import { fetchProblemHtml, checkSession, AuthExpiredError } from './core/fetchProblem';
import { parseProblemHtml } from './core/parser';
import { buildSolutionFile, buildCasesFile } from './core/scaffold';
import { runSampleTests } from './core/testRunner';
import { renderProblemHtml } from './webview/render';
import { ProblemData } from './core/types';

let currentPanel: vscode.WebviewPanel | undefined;
let currentProblemDir: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('programmers.setSessionCookie', async () => {
      const cookie = await vscode.window.showInputBox({
        prompt: '브라우저 개발자도구에서 복사한 Cookie 헤더 값을 붙여넣으세요',
        password: true,
        ignoreFocusOut: true,
      });
      if (!cookie) return;
      await setCookie(context.secrets, cookie);
      vscode.window.showInformationMessage('Programmers 세션 쿠키를 저장했습니다.');
    }),

    vscode.commands.registerCommand('programmers.checkConnection', async () => {
      const cookie = await getCookie(context.secrets);
      if (!cookie) {
        vscode.window.showErrorMessage('먼저 "Programmers: Set Session Cookie"로 쿠키를 설정하세요.');
        return;
      }
      const ok = await checkSession(cookie);
      if (ok) {
        vscode.window.showInformationMessage('Programmers 연결 확인: 정상');
      } else {
        vscode.window.showErrorMessage('Programmers 연결 확인 실패: 쿠키가 만료되었을 수 있습니다.');
      }
    }),

    vscode.commands.registerCommand('programmers.openProblem', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('먼저 워크스페이스 폴더를 여세요.');
        return;
      }

      const rawInput = await vscode.window.showInputBox({
        prompt: 'Programmers 문제 번호 또는 URL을 입력하세요',
      });
      if (!rawInput) return;
      const id = extractProblemId(rawInput);

      const cookie = await getCookie(context.secrets);
      if (!cookie) {
        vscode.window.showErrorMessage('먼저 "Programmers: Set Session Cookie"로 쿠키를 설정하세요.');
        return;
      }

      let problem: ProblemData;
      try {
        const html = await fetchProblemHtml(id, cookie);
        problem = parseProblemHtml(html, id);
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          vscode.window.showErrorMessage('쿠키가 만료된 것 같습니다. 브라우저에서 다시 복사해 설정해주세요.');
        } else {
          vscode.window.showErrorMessage(`문제를 불러오지 못했습니다: ${(err as Error).message}`);
        }
        return;
      }

      const dir = path.join(workspaceFolder.uri.fsPath, '.programmers', id);
      fs.mkdirSync(dir, { recursive: true });
      const solutionPath = path.join(dir, 'solution.py');
      const casesPath = path.join(dir, 'cases.json');
      fs.writeFileSync(solutionPath, buildSolutionFile(problem));
      fs.writeFileSync(casesPath, buildCasesFile(problem));
      currentProblemDir = dir;

      const doc = await vscode.workspace.openTextDocument(solutionPath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

      if (!currentPanel) {
        currentPanel = vscode.window.createWebviewPanel(
          'programmersProblem',
          problem.title,
          vscode.ViewColumn.Two,
          {}
        );
        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        });
      }
      currentPanel.title = problem.title;
      currentPanel.webview.html = renderProblemHtml(problem);
    }),

    vscode.commands.registerCommand('programmers.runSampleTests', async () => {
      if (!currentProblemDir) {
        vscode.window.showErrorMessage('먼저 "Programmers: Open Problem"으로 문제를 여세요.');
        return;
      }
      const solutionPath = path.join(currentProblemDir, 'solution.py');
      const casesPath = path.join(currentProblemDir, 'cases.json');

      try {
        const results = runSampleTests(solutionPath, casesPath);
        const passed = results.filter((r) => r.pass).length;
        const channel = vscode.window.createOutputChannel('Programmers');
        channel.clear();
        channel.appendLine(`${passed}/${results.length} 통과`);
        for (const r of results) {
          if (r.pass) {
            channel.appendLine(`  [PASS] case ${r.index}`);
          } else if (r.error) {
            channel.appendLine(`  [FAIL] case ${r.index}: ${r.error}`);
          } else {
            channel.appendLine(
              `  [FAIL] case ${r.index}: expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`
            );
          }
        }
        channel.show();
      } catch (err) {
        vscode.window.showErrorMessage(`테스트 실행 실패: ${(err as Error).message}`);
      }
    })
  );
}

export function deactivate() {}

function extractProblemId(input: string): string {
  const match = input.match(/lessons\/(\d+)/);
  return match ? match[1] : input.trim();
}
```

- [ ] **Step 3: Update `package.json` `contributes.commands`**

Replace `"commands": []` with:

```json
"commands": [
  { "command": "programmers.setSessionCookie", "title": "Programmers: Set Session Cookie" },
  { "command": "programmers.checkConnection", "title": "Programmers: Check Connection" },
  { "command": "programmers.openProblem", "title": "Programmers: Open Problem" },
  { "command": "programmers.runSampleTests", "title": "Programmers: Run Sample Tests" }
]
```

- [ ] **Step 4: Verify compilation**

Run: `npm run compile`
Expected: exits 0

- [ ] **Step 5: Manual verification in the Extension Development Host**

1. Open this project in VS Code and press `F5` (launches "Extension Development Host")
2. In the new window, open any folder as a workspace
3. Run command palette → "Programmers: Set Session Cookie" → paste any placeholder string like `test=1` → expect the "저장했습니다" info message
4. Run "Programmers: Check Connection" → expect an error message (placeholder cookie is not valid), confirming the command doesn't crash
5. Run "Programmers: Open Problem" → enter `1` → expect either a fetch error (network/auth) shown as a notification, or (if network is reachable) a `.programmers/1/solution.py` file and a webview panel — confirming the command handles both success and failure paths without throwing an uncaught exception

- [ ] **Step 6: Commit**

```bash
git add src/secretsStore.ts src/extension.ts package.json
git commit -m "feat: wire commands for set-cookie, check-connection, open-problem, run-sample-tests"
```

---

## Task 9: Manual verification & selector correction against the live site

This task has no pre-written code changes because its entire purpose is to discover what needs to change — the real markup of school.programmers.co.kr was not accessible during planning. Work through it as a checklist; the file to edit is always `src/core/parser.ts` (and, once corrected, `test/fixtures/sample-problem.html` + `test/core/parser.test.ts`).

**Files:**
- Modify: `src/core/parser.ts` (only the `TITLE_SELECTORS` / `DESCRIPTION_SELECTORS` / `SKELETON_SELECTORS` / `EXAMPLE_TABLE_SELECTORS` constants, if needed)
- Modify: `test/fixtures/sample-problem.html` (replace with a trimmed/anonymized copy of real markup)
- Modify: `test/core/parser.test.ts` (adjust expected values to match the updated fixture)

- [ ] **Step 1: Get a real session cookie**

In Chrome (or any browser), log into `school.programmers.co.kr`, open DevTools → Network tab, reload any lesson page (e.g. `https://school.programmers.co.kr/learn/courses/30/lessons/42840`), click the top-level document request, and copy the full `Cookie` request header value from the Headers panel.

- [ ] **Step 2: Set the cookie in the running extension**

Press `F5`, in the Extension Development Host run "Programmers: Set Session Cookie", paste the copied value.

- [ ] **Step 3: Verify the session**

Run "Programmers: Check Connection". Expected: "연결 확인: 정상". If it fails, the cookie was copied incorrectly — re-copy it from Step 1.

- [ ] **Step 4: Open a known easy problem**

Run "Programmers: Open Problem", enter `42840` (또는 아무 쉬운 문제 번호).

- [ ] **Step 5: Compare parsed output against the real page**

Open the real problem page in a browser tab side-by-side with the generated webview panel and `solution.py`. Check:
- Is the title correct?
- Does the description contain the actual problem text (not empty)?
- Does `solution.py` contain the real function skeleton with correct parameter names?
- Do the example test cases in `.programmers/42840/cases.json` match the ones shown on the real page?

- [ ] **Step 6: If any of the above is wrong, inspect and fix selectors**

In the browser, right-click the mismatched element (title / description / code block / example table) → "Inspect" → note its actual tag name, id, and class. Update the corresponding selector array at the top of `src/core/parser.ts` (add the real selector as the first candidate, keep old guesses as fallback candidates). Run `npm run compile`, reload the Extension Development Host (`Ctrl+R` / `Cmd+R` in that window), and repeat Steps 4–5 until all four fields extract correctly.

- [ ] **Step 7: Run "Programmers: Run Sample Tests" against a correct and an incorrect solution**

Write a correct `solution()` in the opened `solution.py`, run "Programmers: Run Sample Tests", confirm all example cases pass. Then temporarily break the solution (e.g. `return None`), re-run, confirm it reports failures with the expected/actual values.

- [ ] **Step 8: Update the automated regression fixture**

Copy the real (anonymized — remove any personal/session-specific content) HTML structure that made the parser work into `test/fixtures/sample-problem.html`, replacing the guessed structure from Task 3. Update `test/core/parser.test.ts` expectations to match. Run:

Run: `npx jest test/core/parser.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/core/parser.ts test/fixtures/sample-problem.html test/core/parser.test.ts
git commit -m "fix: correct parser selectors against real Programmers markup"
```
