import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RunResult } from './types';

/** 수동 실행인지, 저장 시 자동 실행인지. 자동 실행은 같은 시도를 여러 번 기록하게 된다. */
export type RunTrigger = 'manual' | 'save';

/** `empty`는 채점할 케이스 자체가 없었다는 뜻 — 통과도 실패도 아니다. */
export type RunOutcome = 'pass' | 'fail' | 'error' | 'empty';

/**
 * 디스크에 그대로 직렬화되는 형태라 필드명은 파일 포맷을 따른다(snake_case).
 * 이 로그를 읽는 쪽은 위키 파이프라인(Python)이므로 TS 관례보다 포맷 일치가 우선이다.
 */
export interface RunEvent {
  ts: string;
  host: string;
  trigger: RunTrigger;
  result: RunOutcome;
  passed: number;
  total: number;
  /** solution.py 내용의 해시. 같은 코드를 여러 번 저장한 실행을 한 시도로 묶을 때 쓴다. */
  code_hash: string | null;
}

export interface RunContext {
  trigger: RunTrigger;
  /** solution.py 내용. 읽지 못했으면 생략한다. */
  code?: string;
  now?: Date;
  host?: string;
}

export function hashCode(source: string): string {
  return createHash('sha256').update(source, 'utf-8').digest('hex').slice(0, 12);
}

/** mDNS 접미사를 뗀다. `kisungui-MacBookAir.local`과 `kisungui-MacBookAir`는 같은 기기다. */
export function normalizeHost(hostname: string): string {
  return hostname.replace(/\.(local|lan|localdomain)$/i, '');
}

function base(context: RunContext): Omit<RunEvent, 'result' | 'passed' | 'total'> {
  return {
    ts: (context.now ?? new Date()).toISOString(),
    host: normalizeHost(context.host ?? os.hostname()),
    trigger: context.trigger,
    code_hash: context.code === undefined ? null : hashCode(context.code),
  };
}

export function buildRunEvent(results: readonly RunResult[], context: RunContext): RunEvent {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const result: RunOutcome = total === 0 ? 'empty' : passed === total ? 'pass' : 'fail';
  return { ...base(context), result, passed, total };
}

/** 테스트를 아예 실행하지 못한 경우 (python 오류, 타임아웃 등). */
export function buildErrorRunEvent(context: RunContext): RunEvent {
  return { ...base(context), result: 'error', passed: 0, total: 0 };
}

export function serializeRunEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * runs.jsonl에 한 줄 덧붙인다.
 *
 * append-only인 이유: 여러 기기에서 문제를 풀기 때문이다. `attempts: 3` 같은
 * 스칼라 카운터는 두 기기의 값을 병합할 수 없어 한쪽이 조용히 사라진다.
 * 줄 단위 로그는 git의 union merge로 안전하게 합쳐진다.
 */
export function appendRunEvent(logPath: string, event: RunEvent): void {
  fs.appendFileSync(logPath, serializeRunEvent(event), 'utf-8');
}

/**
 * 코드가 처음 보는 형태일 때만 스냅샷을 남긴다.
 *
 * 같은 코드로 여러 번 저장해도 파일은 하나다 — 파일명이 곧 해시이기 때문에
 * 중복 저장이 구조적으로 불가능하다. 큐가 파일명으로 중복을 막는 것과 같은 방식이다.
 *
 * @returns 새로 남겼으면 true
 */
export function saveAttemptSnapshot(snapshotPath: string, code: string): boolean {
  if (fs.existsSync(snapshotPath)) return false;
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, code, 'utf-8');
  return true;
}
