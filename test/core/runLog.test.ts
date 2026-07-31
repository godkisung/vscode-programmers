import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendRunEvent,
  buildErrorRunEvent,
  buildRunEvent,
  hashCode,
  serializeRunEvent,
  RunContext,
} from '../../src/core/runLog';
import { RunResult } from '../../src/core/types';

const NOW = new Date('2026-07-31T05:00:00.000Z');
const context: RunContext = { trigger: 'manual', now: NOW, host: 'macbook', code: 'def solution(): pass' };

const pass: RunResult = { index: 0, pass: true };
const fail: RunResult = { index: 1, pass: false, expected: 1, actual: 0 };

describe('buildRunEvent', () => {
  test('records pass when every case passed', () => {
    const event = buildRunEvent([pass, pass], context);
    expect(event).toMatchObject({
      ts: '2026-07-31T05:00:00.000Z',
      host: 'macbook',
      trigger: 'manual',
      result: 'pass',
      passed: 2,
      total: 2,
    });
  });

  test('records fail when any case failed', () => {
    expect(buildRunEvent([pass, fail], context)).toMatchObject({
      result: 'fail',
      passed: 1,
      total: 2,
    });
  });

  test('distinguishes "no cases to run" from a pass', () => {
    // cases.json 파싱에 실패하면 케이스가 0개가 된다. 0/0은 통과가 아니다.
    expect(buildRunEvent([], context)).toMatchObject({ result: 'empty', passed: 0, total: 0 });
  });

  test('hashes the solution so repeated saves of identical code are recognizable', () => {
    const a = buildRunEvent([pass], context);
    const b = buildRunEvent([pass], { ...context, code: 'def solution(): pass' });
    const c = buildRunEvent([pass], { ...context, code: 'def solution(): return 1' });

    expect(a.code_hash).toBe(b.code_hash);
    expect(a.code_hash).not.toBe(c.code_hash);
  });

  test('leaves code_hash null when the solution could not be read', () => {
    expect(buildRunEvent([pass], { trigger: 'save', now: NOW, host: 'h' }).code_hash).toBeNull();
  });

  test('keeps the trigger so auto-runs on save can be told apart', () => {
    expect(buildRunEvent([pass], { ...context, trigger: 'save' }).trigger).toBe('save');
  });
});

describe('buildErrorRunEvent', () => {
  test('records a run that could not execute at all', () => {
    expect(buildErrorRunEvent(context)).toMatchObject({ result: 'error', passed: 0, total: 0 });
  });
});

describe('hashCode', () => {
  test('is stable and short', () => {
    expect(hashCode('abc')).toBe(hashCode('abc'));
    expect(hashCode('abc')).toHaveLength(12);
  });
});

describe('serializeRunEvent', () => {
  test('emits one newline-terminated JSON object per run', () => {
    const line = serializeRunEvent(buildRunEvent([pass], context));
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd()).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({ result: 'pass' });
  });
});

describe('appendRunEvent', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlog-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('creates the log on first write and appends afterwards', () => {
    const logPath = path.join(dir, 'runs.jsonl');

    appendRunEvent(logPath, buildRunEvent([fail], context));
    appendRunEvent(logPath, buildRunEvent([pass], context));

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).result).toBe('fail');
    expect(JSON.parse(lines[1]).result).toBe('pass');
  });

  test('never rewrites earlier lines — append-only keeps git union merge safe', () => {
    const logPath = path.join(dir, 'runs.jsonl');
    appendRunEvent(logPath, buildRunEvent([fail], context));
    const first = fs.readFileSync(logPath, 'utf-8');

    appendRunEvent(logPath, buildRunEvent([pass], context));
    expect(fs.readFileSync(logPath, 'utf-8').startsWith(first)).toBe(true);
  });
});
