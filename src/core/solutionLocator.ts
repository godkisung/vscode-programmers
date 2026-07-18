/** solution.py 소스에서 `def solution(...)` 정의가 있는 0-기준 줄 번호를 찾는다. 없으면 0. */
export function findSolutionDefLine(source: string): number {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => /^\s*def\s+solution\s*\(/.test(line));
  return index === -1 ? 0 : index;
}
