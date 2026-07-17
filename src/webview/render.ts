import sanitizeHtml from 'sanitize-html';
import { ProblemData } from '../core/types';

const ORIGIN = 'https://school.programmers.co.kr';

const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https://school.programmers.co.kr https:; style-src \'unsafe-inline\';">';

const STYLE = `
  <style>
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 16px;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }
    a:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    a:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family);
      padding: 0.1em 0.4em;
      border-radius: 3px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      overflow-x: auto;
      border-radius: 4px;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 10px;
    }
    blockquote {
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      background: var(--vscode-textBlockQuote-background);
      padding: 8px 12px;
      margin: 8px 0;
    }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
    }
    img {
      max-width: 100%;
      height: auto;
    }
    ul, ol {
      padding-left: 24px;
    }
  </style>
`;

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
    ${CSP_META}
    ${STYLE}
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
