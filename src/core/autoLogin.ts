import { chromium, BrowserContext } from 'playwright-core';
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function runAutoLogin(profileDir: string, signal: AbortSignal): Promise<string> {
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
    });
  } catch (err) {
    throw new BrowserLaunchError(`Chrome을 실행하지 못했습니다: ${(err as Error).message}`);
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`https://${TARGET_HOST}`);

    let consecutiveSuccesses = 0;
    while (!signal.aborted) {
      const cookies = await context.cookies();
      const cookieString = filterAndFormatCookies(cookies);
      const valid = cookieString.length > 0 && (await checkSession(cookieString));

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
    await context.close();
  }
}
