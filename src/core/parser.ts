import * as cheerio from 'cheerio';
import { ProblemData, ParsedExample } from './types';
import { parseCaseValue, CaseValueResult } from './caseParser';

const TITLE_SELECTORS = ['.algorithm-title', 'h4.tit-area', 'h1'];
const DESCRIPTION_SELECTORS = ['.guide-section-description', '.markdown', 'article'];
const SKELETON_SELECTORS = ['#code', 'textarea#code_editor', 'pre.skeleton-code'];
const EXAMPLE_TABLE_SELECTORS = ['table.table', 'div.example table', 'table'];

export function parseProblemHtml(html: string, id: string): ProblemData {
  const $ = cheerio.load(html);

  const title = firstMatchText($, TITLE_SELECTORS) ?? `Problem ${id}`;
  const descriptionHtml = firstMatchHtml($, DESCRIPTION_SELECTORS) ?? '';
  const skeletonCode = firstMatchText($, SKELETON_SELECTORS) ?? null;
  const { paramNames, examples } = parseExampleTable($, EXAMPLE_TABLE_SELECTORS);

  return { id, title, descriptionHtml, paramNames, skeletonCode, examples };
}

function firstMatchText($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim()) return el.text().trim();
  }
  return null;
}

function firstMatchHtml($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    const html = el.html();
    if (el.length && html?.trim()) return html.trim();
  }
  return null;
}

function parseExampleTable(
  $: cheerio.CheerioAPI,
  selectors: string[]
): { paramNames: string[]; examples: ParsedExample[] } {
  for (const sel of selectors) {
    const table = $(sel).first();
    if (!table.length) continue;

    const headers = table
      .find('thead tr th')
      .map((_, th) => $(th).text().trim())
      .get();
    if (headers.length === 0) continue;

    const paramNames = headers.slice(0, -1);
    const examples: ParsedExample[] = [];

    table.find('tbody tr').each((_, tr) => {
      const cells = $(tr)
        .find('td')
        .map((_, td) => $(td).text().trim())
        .get();
      if (cells.length !== headers.length) return;

      const parsedInputs: CaseValueResult[] = cells.slice(0, -1).map(parseCaseValue);
      const parsedOutput = parseCaseValue(cells[cells.length - 1]);
      const ok = parsedInputs.every((p) => p.ok) && parsedOutput.ok;

      examples.push({
        ok,
        raw: cells,
        inputs: ok ? parsedInputs.map((p) => (p as { ok: true; value: unknown }).value) : undefined,
        output: ok ? (parsedOutput as { ok: true; value: unknown }).value : undefined,
      });
    });

    if (examples.length > 0) return { paramNames, examples };
  }
  return { paramNames: [], examples: [] };
}
