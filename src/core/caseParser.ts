export type CaseValueResult =
  | { ok: true; value: unknown }
  | { ok: false; raw: string };

export function parseCaseValue(text: string): CaseValueResult {
  const trimmed = text.trim();

  const direct = tryJsonParse(trimmed);
  if (direct.ok) return direct;

  const normalized = normalizePythonLiteral(trimmed);
  const fallback = tryJsonParse(normalized);
  if (fallback.ok) return fallback;

  return { ok: false, raw: trimmed };
}

function tryJsonParse(text: string): CaseValueResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, raw: text };
  }
}

function normalizePythonLiteral(text: string): string {
  let result = '';
  let inDouble = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      inDouble = !inDouble;
      result += ch;
      i++;
      continue;
    }

    if (!inDouble && ch === "'") {
      let j = i + 1;
      let content = '';
      while (j < text.length && text[j] !== "'") {
        content += text[j];
        j++;
      }
      result += '"' + content.replace(/"/g, '\\"') + '"';
      i = j + 1;
      continue;
    }

    if (!inDouble) {
      const rest = text.slice(i);
      const keywordMatch = rest.match(/^(True|False|None)\b/);
      if (keywordMatch) {
        const keyword = keywordMatch[1];
        result += keyword === 'True' ? 'true' : keyword === 'False' ? 'false' : 'null';
        i += keyword.length;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}
