import sanitizeHtml from 'sanitize-html';
import { ProblemData } from '../core/types';

const ORIGIN = 'https://school.programmers.co.kr';

export function renderProblemHtml(problem: ProblemData): string {
  const sanitized = sanitizeHtml(problem.descriptionHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedSchemes: ['http', 'https'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt'],
      a: ['href', 'rel'],
    },
    transformTags: {
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, src: toAbsoluteUrl(attribs.src) },
      }),
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, href: toAbsoluteUrl(attribs.href), rel: 'noopener noreferrer' },
      }),
    },
  });

  const originalUrl = `${ORIGIN}/learn/courses/30/lessons/${problem.id}`;

  return `
    <h1>${escapeHtml(problem.title)}</h1>
    <div>${sanitized}</div>
    <p><a href="${originalUrl}">원본 페이지에서 보기</a></p>
  `;
}

function toAbsoluteUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('#')) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  return new URL(url, ORIGIN).toString();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
