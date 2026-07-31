export const PROGRAMMERS_ORIGIN = 'https://school.programmers.co.kr';

export function problemUrl(id: string): string {
  return `${PROGRAMMERS_ORIGIN}/learn/courses/30/lessons/${id}`;
}

/**
 * 문제 페이지에서 긁어온 상대 URL을 절대 URL로 바꾼다.
 * `javascript:` 같은 위험한 스킴은 빈 문자열로 떨어뜨린다.
 */
export function toAbsoluteUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('#')) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  return new URL(url, PROGRAMMERS_ORIGIN).toString();
}
