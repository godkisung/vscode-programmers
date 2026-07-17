const LESSON_URL_PATTERN = /lessons\/(\d+)/;
const PURE_ID_PATTERN = /^\d{4,6}$/;

export function detectProblemIdCandidate(text: string): string | undefined {
  const trimmed = text.trim();

  const urlMatch = trimmed.match(LESSON_URL_PATTERN);
  if (urlMatch) {
    return urlMatch[1];
  }

  if (PURE_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}
