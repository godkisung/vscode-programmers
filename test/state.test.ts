import type { Memento } from 'vscode';
import { ExtensionState, CurrentProblem } from '../src/state';

function createMemento(initial: Record<string, unknown> = {}): Memento {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    keys: () => [...store.keys()],
    get: <T>(key: string, defaultValue?: T) =>
      (store.has(key) ? (store.get(key) as T) : defaultValue) as T,
    update: async (key: string, value: unknown) => {
      if (value === undefined) store.delete(key);
      else store.set(key, value);
    },
  } as Memento;
}

const problem: CurrentProblem = {
  id: '42576',
  title: '완주하지 못한 선수',
  dir: '/ws/.programmers/42576',
  url: 'https://school.programmers.co.kr/learn/courses/30/lessons/42576',
};

describe('ExtensionState', () => {
  test('starts with no problem, unknown connection, no last run', () => {
    const state = new ExtensionState(createMemento());
    expect(state.currentProblem).toBeUndefined();
    expect(state.connection).toBe('unknown');
    expect(state.lastRun).toBeUndefined();
  });

  test('setCurrentProblem updates the value and notifies subscribers', async () => {
    const state = new ExtensionState(createMemento());
    const seen: (CurrentProblem | undefined)[] = [];
    state.onDidChangeProblem((p) => seen.push(p));

    await state.setCurrentProblem(problem);

    expect(state.currentProblem).toEqual(problem);
    expect(seen).toEqual([problem]);
  });

  test('setCurrentProblem persists to the memento and restore() recovers it', async () => {
    const memento = createMemento();
    const first = new ExtensionState(memento);
    await first.setCurrentProblem(problem);

    const second = new ExtensionState(memento);
    second.restore(() => true);
    expect(second.currentProblem).toEqual(problem);
  });

  test('restore() drops the saved problem when the validator rejects it', async () => {
    const memento = createMemento();
    const first = new ExtensionState(memento);
    await first.setCurrentProblem(problem);

    const second = new ExtensionState(memento);
    second.restore(() => false);
    expect(second.currentProblem).toBeUndefined();
  });

  test('setConnection notifies only on change', () => {
    const state = new ExtensionState(createMemento());
    const seen: string[] = [];
    state.onDidChangeConnection((s) => seen.push(s));

    state.setConnection('ok');
    state.setConnection('ok');
    state.setConnection('expired');

    expect(seen).toEqual(['ok', 'expired']);
  });

  test('setLastRun stores results and notifies subscribers', () => {
    const state = new ExtensionState(createMemento());
    const seen: unknown[] = [];
    state.onDidChangeTestResults((r) => seen.push(r));

    const run = { results: [{ index: 0, pass: true }], debugOutput: '' };
    state.setLastRun(run);

    expect(state.lastRun).toEqual(run);
    expect(seen).toEqual([run]);
  });

  test('setCurrentProblem clears the previous lastRun', async () => {
    const state = new ExtensionState(createMemento());
    state.setLastRun({ results: [{ index: 0, pass: true }], debugOutput: '' });

    await state.setCurrentProblem(problem);

    expect(state.lastRun).toBeUndefined();
  });

  test('event subscriptions can be disposed', async () => {
    const state = new ExtensionState(createMemento());
    const seen: unknown[] = [];
    const sub = state.onDidChangeProblem((p) => seen.push(p));
    sub.dispose();

    await state.setCurrentProblem(problem);
    expect(seen).toEqual([]);
  });
});
