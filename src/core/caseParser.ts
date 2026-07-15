export type CaseValueResult =
  | { ok: true; value: unknown }
  | { ok: false; raw: string };

export function parseCaseValue(text: string): CaseValueResult {
  const trimmed = text.trim();

  const direct = tryJsonParse(trimmed);
  if (direct.ok) return direct;

  const normalized = trimmed
    .replace(/'/g, '"')
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false');
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
