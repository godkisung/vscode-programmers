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
