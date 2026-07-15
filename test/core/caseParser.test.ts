import { parseCaseValue } from '../../src/core/caseParser';

describe('parseCaseValue', () => {
  test('parses a JSON array directly', () => {
    expect(parseCaseValue('[1, 2, 3]')).toEqual({ ok: true, value: [1, 2, 3] });
  });

  test('parses a double-quoted JSON string directly', () => {
    expect(parseCaseValue('"abcdef"')).toEqual({ ok: true, value: 'abcdef' });
  });

  test('parses lowercase JSON booleans directly', () => {
    expect(parseCaseValue('true')).toEqual({ ok: true, value: true });
  });

  test('falls back to normalize single-quoted strings', () => {
    expect(parseCaseValue("['a', 'b', 'c']")).toEqual({ ok: true, value: ['a', 'b', 'c'] });
  });

  test('falls back to normalize Python-style True/False/None', () => {
    expect(parseCaseValue('[True, False, None]')).toEqual({ ok: true, value: [true, false, null] });
  });

  test('parses nested arrays', () => {
    expect(parseCaseValue('[[1, 2], [3, 4]]')).toEqual({ ok: true, value: [[1, 2], [3, 4]] });
  });

  test('returns ok:false for unparseable text', () => {
    const result = parseCaseValue('not { a valid } value [');
    expect(result.ok).toBe(false);
  });
});
