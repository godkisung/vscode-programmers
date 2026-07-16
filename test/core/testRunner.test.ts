import * as path from 'path';
import { runSampleTests } from '../../src/core/testRunner';

describe('runSampleTests', () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  test('runs the solution against each case and reports pass/fail', () => {
    const { results } = runSampleTests(
      path.join(fixturesDir, 'sample-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results).toEqual([
      { index: 0, pass: true, actual: 'leo', expected: 'leo' },
      { index: 1, pass: true, actual: 'a', expected: 'a' },
    ]);
  });

  test('reports a runtime exception without crashing the whole run', () => {
    const { results } = runSampleTests(
      path.join(fixturesDir, 'broken-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results[0].pass).toBe(false);
    expect(results[0].error).toContain('NameError');
  });

  test('still parses the final JSON line when the user solution prints debug output', () => {
    const { results } = runSampleTests(
      path.join(fixturesDir, 'printing-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results).toEqual([
      { index: 0, pass: true, actual: 'leo', expected: 'leo' },
      { index: 1, pass: true, actual: 'a', expected: 'a' },
    ]);
  });

  test('captures the user solution\'s print() output as debugOutput', () => {
    const { debugOutput } = runSampleTests(
      path.join(fixturesDir, 'printing-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(debugOutput).toBe(
      'debug: checking participants\ndebug: counter computed\ndebug: checking participants\ndebug: counter computed'
    );
  });

  test('debugOutput is empty when the solution prints nothing', () => {
    const { debugOutput } = runSampleTests(
      path.join(fixturesDir, 'sample-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(debugOutput).toBe('');
  });

  test('kills the process and reports a clear error when the solution times out', () => {
    expect(() =>
      runSampleTests(
        path.join(fixturesDir, 'infinite-loop-solution.py'),
        path.join(fixturesDir, 'sample-cases.json'),
        500
      )
    ).toThrow('0.5초');
  });
});
