import { detectProblemIdCandidate } from '../../src/core/clipboardCandidate';

describe('detectProblemIdCandidate', () => {
  test('extracts the id from a lessons URL', () => {
    expect(detectProblemIdCandidate('https://school.programmers.co.kr/learn/courses/30/lessons/42840')).toBe(
      '42840'
    );
  });

  test('extracts the id from a lessons URL regardless of digit count', () => {
    expect(detectProblemIdCandidate('https://school.programmers.co.kr/learn/courses/30/lessons/1')).toBe('1');
    expect(
      detectProblemIdCandidate('https://school.programmers.co.kr/learn/courses/30/lessons/1234567')
    ).toBe('1234567');
  });

  test('accepts a pure 4-to-6-digit number', () => {
    expect(detectProblemIdCandidate('42840')).toBe('42840');
    expect(detectProblemIdCandidate('1234')).toBe('1234');
    expect(detectProblemIdCandidate('123456')).toBe('123456');
  });

  test('rejects a pure number outside the 4-to-6-digit range', () => {
    expect(detectProblemIdCandidate('123')).toBeUndefined();
    expect(detectProblemIdCandidate('1234567')).toBeUndefined();
  });

  test('rejects non-numeric, non-URL clipboard text', () => {
    expect(detectProblemIdCandidate('hello world')).toBeUndefined();
    expect(detectProblemIdCandidate('')).toBeUndefined();
  });

  test('trims surrounding whitespace before matching', () => {
    expect(detectProblemIdCandidate('  42840  \n')).toBe('42840');
  });
});
