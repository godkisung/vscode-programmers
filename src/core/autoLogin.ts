import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser } from 'playwright-core';
import { checkSession } from './fetchProblem';

export class BrowserLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserLaunchError';
  }
}

export class LoginCancelledError extends Error {
  constructor() {
    super('로그인이 취소되었습니다.');
    this.name = 'LoginCancelledError';
  }
}

export interface CookiePair {
  name: string;
  value: string;
  domain: string;
}

const TARGET_HOST = 'school.programmers.co.kr';
const POLL_INTERVAL_MS = 2500;
const REQUIRED_CONSECUTIVE_SUCCESSES = 2;
const CDP_READY_TIMEOUT_MS = 15000;

export function filterAndFormatCookies(cookies: CookiePair[], targetHost: string = TARGET_HOST): string {
  return cookies
    .filter((c) => domainMatches(c.domain, targetHost))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

function domainMatches(cookieDomain: string, targetHost: string): boolean {
  const normalized = cookieDomain.replace(/^\./, '');
  return normalized === targetHost || targetHost.endsWith(`.${normalized}`);
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function resolveChromeExecutable(
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return chromeCandidates(platform, env).find((p) => exists(p)) ?? null;
}

function chromeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32') {
    return [
      path.win32.join(env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.win32.join(
        env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    ];
  }
  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  return ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
}

function spawnChrome(execPath: string, profileDir: string): ChildProcess {
  return spawn(
    execPath,
    [
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--new-window',
      `https://${TARGET_HOST}`,
    ],
    { stdio: 'ignore' }
  );
}

function clearStaleDevToolsActivePort(profileDir: string): void {
  try {
    fs.unlinkSync(path.join(profileDir, 'DevToolsActivePort'));
  } catch {
    // no previous file from an earlier run — nothing to clear
  }
}

async function waitForDevToolsActivePort(
  profileDir: string,
  timeoutMs: number,
  signal: AbortSignal,
  getSpawnError: () => Error | undefined
): Promise<number> {
  const filePath = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new LoginCancelledError();
    }
    const spawnError = getSpawnError();
    if (spawnError) {
      throw new BrowserLaunchError(`Chrome을 실행하지 못했습니다: ${spawnError.message}`);
    }
    if (fs.existsSync(filePath)) {
      const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0].trim();
      const port = Number(firstLine);
      if (Number.isFinite(port) && port > 0) {
        return port;
      }
    }
    await sleep(200, signal);
  }

  throw new BrowserLaunchError('Chrome의 디버깅 포트를 확인하지 못했습니다 (시간 초과).');
}

export async function runAutoLogin(
  profileDir: string,
  signal: AbortSignal,
  onLog: (msg: string) => void = () => undefined
): Promise<string> {
  const execPath = resolveChromeExecutable();
  if (!execPath) {
    throw new BrowserLaunchError('Chrome 실행 파일을 찾지 못했습니다.');
  }
  onLog(`Chrome 실행 파일: ${execPath}`);

  fs.mkdirSync(profileDir, { recursive: true });
  clearStaleDevToolsActivePort(profileDir);

  let child: ChildProcess;
  try {
    child = spawnChrome(execPath, profileDir);
  } catch (err) {
    throw new BrowserLaunchError(`Chrome을 실행하지 못했습니다: ${(err as Error).message}`);
  }
  onLog(`Chrome 프로세스 시작됨 (PID ${child.pid})`);

  let earlySpawnError: Error | undefined;
  child.on('error', (err) => {
    earlySpawnError = err;
  });

  let port: number;
  try {
    port = await waitForDevToolsActivePort(profileDir, CDP_READY_TIMEOUT_MS, signal, () => earlySpawnError);
  } catch (err) {
    child.kill();
    throw err;
  }
  onLog(`CDP 디버깅 포트 확인됨: ${port}`);

  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch (err) {
    child.kill();
    throw new BrowserLaunchError(`Chrome에 연결하지 못했습니다: ${(err as Error).message}`);
  }
  onLog('CDP 연결 성공');

  try {
    const existingContexts = browser.contexts();
    onLog(`브라우저 컨텍스트 개수: ${existingContexts.length}`);
    const context = existingContexts[0] ?? (await browser.newContext());
    if (existingContexts.length === 0) {
      onLog('경고: 기존 컨텍스트를 찾지 못해 새 빈 컨텍스트를 생성했습니다 — 이 컨텍스트는 로그인 창과 무관할 수 있습니다.');
    }

    let consecutiveSuccesses = 0;
    let pollCount = 0;
    while (!signal.aborted) {
      const cookies = await context.cookies();
      const cookieString = filterAndFormatCookies(cookies);
      const valid = cookieString.length > 0 && (await checkSession(cookieString));
      pollCount++;
      onLog(
        `폴링 #${pollCount}: 컨텍스트 쿠키 ${cookies.length}개, 대상 도메인 쿠키 ${
          cookieString.length > 0 ? '있음' : '없음'
        }, 세션 유효성=${valid}`
      );

      if (valid) {
        consecutiveSuccesses++;
        if (consecutiveSuccesses >= REQUIRED_CONSECUTIVE_SUCCESSES) {
          return cookieString;
        }
      } else {
        consecutiveSuccesses = 0;
      }

      await sleep(POLL_INTERVAL_MS, signal);
    }

    throw new LoginCancelledError();
  } finally {
    await browser.close().catch(() => undefined);
    child.kill();
  }
}
