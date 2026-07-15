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

  test('ignores debug print() output from the user solution and still parses the final JSON line', () => {
    const results = runSampleTests(
      path.join(fixturesDir, 'printing-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results).toEqual([
      { index: 0, pass: true, actual: 'leo', expected: 'leo' },
      { index: 1, pass: true, actual: 'a', expected: 'a' },
    ]);
  });
});
