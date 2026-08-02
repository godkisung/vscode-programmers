import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ProblemData } from './types';
import { problemUrl, toAbsoluteUrl } from './urls';

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  service.use(gfm);
  service.remove(['script', 'style']);

  // 문제 페이지의 상대 경로를 절대 URL로 바꾼다. 위키로 옮기면 원래 문서와
  // 분리되므로 상대 경로는 그대로 두면 깨진다.
  service.addRule('absoluteImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const src = toAbsoluteUrl(node.getAttribute('src') ?? undefined);
      if (!src) return '';
      const alt = node.getAttribute('alt') ?? '';
      return `![${alt}](${src})`;
    },
  });

  service.addRule('absoluteLink', {
    filter: (node) => node.nodeName === 'A' && node.getAttribute('href') !== null,
    replacement: (content, node) => {
      const href = toAbsoluteUrl(node.getAttribute('href') ?? undefined);
      return href ? `[${content}](${href})` : content;
    },
  });

  return service;
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';
  return cleanDescription(createTurndown().turndown(html));
}

/** 헤딩으로 시작하는 줄인지. 코드 블록 안의 `#` 주석은 제외한다. */
const HEADING = /^(#{1,6})\s+(.*)$/;
/** 문제 페이지가 붙이는 운영 공지. 문제를 푸는 데는 쓸모가 없다. */
const NOTICE = /^\s*※\s*공지/;
/** 페이지 자체의 입출력 예 절. 노트는 `## 테스트 케이스`를 따로 만들므로 중복이다. */
const EXAMPLES_HEADING = /^입출력\s*예\s*$/;

/**
 * 스크래핑한 설명을 노트에 넣기 좋게 다듬는다.
 *
 * - 헤딩을 `###` 이하로 낮춘다. 노트의 절은 `##`이므로 그보다 얕으면 목차가 뒤집힌다
 * - 운영 공지(`※ 공지 - ...`)를 버린다
 * - 페이지의 입출력 예 표를 버린다 — 같은 표가 `## 테스트 케이스`에 다시 나온다
 *   (`입출력 예 설명`은 남긴다. 표가 아니라 해설이다)
 */
export function cleanDescription(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  let skipping = false;

  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      if (!inFence) {
        out.push(line);
        continue;
      }
    }

    if (inFence) {
      if (!skipping) out.push(line);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      skipping = EXAMPLES_HEADING.test(heading[2].trim());
      if (skipping) continue;
      // 페이지의 헤딩 레벨은 의미가 없다 — `문제 설명`이 h6인데 `제한사항`이 h5다.
      // 전부 같은 깊이로 평탄화하고, 노트의 `##`보다는 한 단계 아래로 둔다.
      out.push(`### ${heading[2]}`);
      continue;
    }

    if (skipping || NOTICE.test(line)) continue;
    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 문제 페이지를 `problem.md`로 저장할 형태로 만든다.
 *
 * 기존에는 descriptionHtml을 웹뷰로 렌더링만 하고 버렸다. 위키 파이프라인이
 * 문제 설명을 읽으려면 디스크에 남아 있어야 한다.
 *
 * 예제 표는 `cases.json`과 별개로 **원본 문자열 그대로** 남긴다. 파싱에 실패한
 * 케이스는 cases.json에서 빠지는데, 그 값이 사라지지 않도록 붙잡아두는 역할이다.
 */
export function buildProblemMarkdown(problem: ProblemData, fetchedAt: Date = new Date()): string {
  const url = problemUrl(problem.id);

  const frontmatter = [
    '---',
    `id: ${yamlScalar(problem.id)}`,
    `title: ${yamlScalar(problem.title)}`,
    `url: ${url}`,
    'platform: programmers',
    `level: ${problem.level ?? 'null'}`,
    `fetched_at: ${fetchedAt.toISOString()}`,
    '---',
  ].join('\n');

  const sections = [frontmatter, '', `# ${problem.title}`, ''];

  const body = htmlToMarkdown(problem.descriptionHtml);
  sections.push(body || '_문제 설명을 가져오지 못했습니다._', '');

  const examples = buildExamplesSection(problem);
  if (examples) sections.push(examples, '');

  sections.push(`[원본 페이지에서 보기](${url})`, '');

  return sections.join('\n');
}

function buildExamplesSection(problem: ProblemData): string {
  const examples = problem.examples;
  if (examples.length === 0) return '';

  const failed = examples.filter((e) => !e.ok).length;
  const headers = [...problem.paramNames, 'result'];
  const showStatus = failed > 0;
  if (showStatus) headers.push('파싱');

  const lines = ['## 입출력 예', ''];

  if (showStatus) {
    lines.push(
      `> [!warning] 예제 케이스 ${failed}개를 자동으로 파싱하지 못했습니다.`,
      '> 이 케이스들은 `cases.json`에 빠져 있습니다. 아래 표는 문제 페이지의 원본 값입니다.',
      ''
    );
  }

  lines.push(
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`
  );

  for (const example of examples) {
    const cells = headers.map((_, i) => escapeCell(example.raw[i] ?? ''));
    if (showStatus) cells[headers.length - 1] = example.ok ? '✅' : '⚠️';
    lines.push(`| ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}

/** 표 안에서 셀 구분자와 줄바꿈이 표를 깨뜨리지 않게 한다. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * YAML 스칼라로 안전한 값이면 그대로, 아니면 큰따옴표로 감싼다.
 * 문제 제목에 `:`나 `#`가 들어가면 따옴표 없이는 frontmatter가 깨진다.
 */
function yamlScalar(value: string): string {
  const needsQuote =
    value === '' ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    /: |:$| #/.test(value) ||
    value !== value.trim() ||
    /[\n\r\t]/.test(value) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(value) ||
    /^-?\d+(\.\d+)?$/.test(value);

  return needsQuote ? JSON.stringify(value) : value;
}
