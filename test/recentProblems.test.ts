import type { Memento } from 'vscode';
import { getRecentProblems, addRecentProblem, RecentProblem } from '../src/recentProblems';

function createMockMemento(initial: Record<string, unknown> = {}): Memento {
  const store: Record<string, unknown> = { ...initial };
  return {
    keys: () => Object.keys(store),
    get: (key: string, defaultValue?: unknown) => (key in store ? store[key] : defaultValue),
    update: async (key: string, value: unknown) => {
      store[key] = value;
    },
  } as unknown as Memento;
}

describe('getRecentProblems', () => {
  test('returns an empty array when nothing has been stored yet', () => {
    expect(getRecentProblems(createMockMemento())).toEqual([]);
  });
});

describe('addRecentProblem', () => {
  test('adds a new entry to the front of the list', async () => {
    const memento = createMockMemento();
    await addRecentProblem(memento, { id: '1', title: 'One' });
    await addRecentProblem(memento, { id: '2', title: 'Two' });

    expect(getRecentProblems(memento)).toEqual([
      { id: '2', title: 'Two' },
      { id: '1', title: 'One' },
    ]);
  });

  test('moves a re-added id to the front instead of duplicating it', async () => {
    const memento = createMockMemento();
    await addRecentProblem(memento, { id: '1', title: 'One' });
    await addRecentProblem(memento, { id: '2', title: 'Two' });
    await addRecentProblem(memento, { id: '1', title: 'One (retitled)' });

    expect(getRecentProblems(memento)).toEqual([
      { id: '1', title: 'One (retitled)' },
      { id: '2', title: 'Two' },
    ]);
  });

  test('caps the list at 10 entries, dropping the oldest', async () => {
    const memento = createMockMemento();
    for (let i = 1; i <= 11; i++) {
      await addRecentProblem(memento, { id: String(i), title: `Problem ${i}` });
    }

    const recent = getRecentProblems(memento);
    expect(recent).toHaveLength(10);
    expect(recent[0]).toEqual({ id: '11', title: 'Problem 11' });
    expect(recent.find((p: RecentProblem) => p.id === '1')).toBeUndefined();
  });
});
