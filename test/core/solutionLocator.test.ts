import { findSolutionDefLine } from '../../src/core/solutionLocator';

describe('findSolutionDefLine', () => {
  test('finds the def solution line below header comments', () => {
    const source = [
      '# 완주하지 못한 선수',
      '# https://school.programmers.co.kr/...',
      '',
      'def solution(participant, completion):',
      '    pass',
    ].join('\n');

    expect(findSolutionDefLine(source)).toBe(3);
  });

  test('matches an indented or spaced def', () => {
    expect(findSolutionDefLine('def  solution ( x ):\n    pass')).toBe(0);
  });

  test('ignores functions with other names', () => {
    const source = ['def helper():', '    pass', 'def solution(x):', '    pass'].join('\n');
    expect(findSolutionDefLine(source)).toBe(2);
  });

  test('falls back to line 0 when no def solution exists', () => {
    expect(findSolutionDefLine('print("hello")')).toBe(0);
  });
});
