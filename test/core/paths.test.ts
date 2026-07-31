import * as path from 'path';
import {
  resolveDataRoot,
  problemDir,
  solutionPath,
  casesPath,
  problemMdPath,
  runsLogPath,
} from '../../src/core/paths';

const WORKSPACE = path.join('/', 'home', 'me', 'workspace', 'vscode-programmers');
const HOME = path.join('/', 'home', 'me');

describe('resolveDataRoot', () => {
  test('falls back to <workspace>/.programmers when unset', () => {
    expect(resolveDataRoot(WORKSPACE, undefined, HOME)).toBe(path.join(WORKSPACE, '.programmers'));
  });

  test('treats an empty or whitespace-only setting as unset', () => {
    expect(resolveDataRoot(WORKSPACE, '', HOME)).toBe(path.join(WORKSPACE, '.programmers'));
    expect(resolveDataRoot(WORKSPACE, '   ', HOME)).toBe(path.join(WORKSPACE, '.programmers'));
  });

  test('expands a leading ~ to the home directory', () => {
    expect(resolveDataRoot(WORKSPACE, '~/algo-wiki/solutions', HOME)).toBe(
      path.join(HOME, 'algo-wiki', 'solutions')
    );
  });

  test('expands a bare ~', () => {
    expect(resolveDataRoot(WORKSPACE, '~', HOME)).toBe(HOME);
  });

  test('keeps an absolute path as-is', () => {
    const abs = path.join('/', 'var', 'algo');
    expect(resolveDataRoot(WORKSPACE, abs, HOME)).toBe(abs);
  });

  test('resolves a relative path against the workspace', () => {
    expect(resolveDataRoot(WORKSPACE, '../algo-wiki/solutions', HOME)).toBe(
      path.resolve(WORKSPACE, '../algo-wiki/solutions')
    );
  });

  test('trims surrounding whitespace before resolving', () => {
    expect(resolveDataRoot(WORKSPACE, '  ~/algo-wiki  ', HOME)).toBe(path.join(HOME, 'algo-wiki'));
  });
});

describe('problem file paths', () => {
  const dir = problemDir(path.join(HOME, 'algo-wiki', 'solutions'), '12973');

  test('places each problem in its own directory keyed by id', () => {
    expect(dir).toBe(path.join(HOME, 'algo-wiki', 'solutions', '12973'));
  });

  test('derives every file name from the problem directory', () => {
    expect(solutionPath(dir)).toBe(path.join(dir, 'solution.py'));
    expect(casesPath(dir)).toBe(path.join(dir, 'cases.json'));
    expect(problemMdPath(dir)).toBe(path.join(dir, 'problem.md'));
    expect(runsLogPath(dir)).toBe(path.join(dir, 'runs.jsonl'));
  });
});
