import * as path from 'path';
import { runSampleTests, TestRunCancelledError } from '../../src/core/testRunner';

describe('runSampleTests', () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  test('runs the solution against each case and reports pass/fail', async () => {
    const { results } = await runSampleTests(
      path.join(fixturesDir, 'sample-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results).toEqual([
      { index: 0, pass: true, actual: 'leo', expected: 'leo', timeMs: expect.any(Number) },
      { index: 1, pass: true, actual: 'a', expected: 'a', timeMs: expect.any(Number) },
    ]);
  });

  test('reports a runtime exception without crashing the whole run', async () => {
    const { results } = await runSampleTests(
      path.join(fixturesDir, 'broken-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results[0].pass).toBe(false);
    expect(results[0].error).toContain('NameError');
  });

  test('still parses the final JSON line when the user solution prints debug output', async () => {
    const { results } = await runSampleTests(
      path.join(fixturesDir, 'printing-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(results).toEqual([
      { index: 0, pass: true, actual: 'leo', expected: 'leo', timeMs: expect.any(Number) },
      { index: 1, pass: true, actual: 'a', expected: 'a', timeMs: expect.any(Number) },
    ]);
  });

  test("captures the user solution's print() output as debugOutput", async () => {
    const { debugOutput } = await runSampleTests(
      path.join(fixturesDir, 'printing-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(debugOutput).toBe(
      'debug: checking participants\ndebug: counter computed\ndebug: checking participants\ndebug: counter computed'
    );
  });

  test('debugOutput is empty when the solution prints nothing', async () => {
    const { debugOutput } = await runSampleTests(
      path.join(fixturesDir, 'sample-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );

    expect(debugOutput).toBe('');
  });

  test('reports timeMs as a non-negative number for every case, including failures', async () => {
    const passing = await runSampleTests(
      path.join(fixturesDir, 'sample-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );
    for (const r of passing.results) {
      expect(typeof r.timeMs).toBe('number');
      expect(r.timeMs as number).toBeGreaterThanOrEqual(0);
    }

    const failing = await runSampleTests(
      path.join(fixturesDir, 'broken-solution.py'),
      path.join(fixturesDir, 'sample-cases.json')
    );
    for (const r of failing.results) {
      expect(typeof r.timeMs).toBe('number');
      expect(r.timeMs as number).toBeGreaterThanOrEqual(0);
    }
  });

  test('kills the process and reports a clear error when the solution times out', async () => {
    await expect(
      runSampleTests(
        path.join(fixturesDir, 'infinite-loop-solution.py'),
        path.join(fixturesDir, 'sample-cases.json'),
        { timeoutMs: 500 }
      )
    ).rejects.toThrow('0.5초');
  });

  test('rejects with TestRunCancelledError when the signal aborts mid-run', async () => {
    const controller = new AbortController();
    const promise = runSampleTests(
      path.join(fixturesDir, 'infinite-loop-solution.py'),
      path.join(fixturesDir, 'sample-cases.json'),
      { timeoutMs: 10000, signal: controller.signal }
    );
    setTimeout(() => controller.abort(), 100);
    await expect(promise).rejects.toThrow(TestRunCancelledError);
  });

  test('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runSampleTests(
        path.join(fixturesDir, 'sample-solution.py'),
        path.join(fixturesDir, 'sample-cases.json'),
        { signal: controller.signal }
      )
    ).rejects.toThrow(TestRunCancelledError);
  });
});
