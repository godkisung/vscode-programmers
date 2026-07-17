import type { Memento } from 'vscode';

export interface RecentProblem {
  id: string;
  title: string;
}

const RECENT_PROBLEMS_KEY = 'programmers.recentProblems';
const MAX_RECENT = 10;

export function getRecentProblems(memento: Memento): RecentProblem[] {
  return memento.get<RecentProblem[]>(RECENT_PROBLEMS_KEY, []);
}

export async function addRecentProblem(memento: Memento, entry: RecentProblem): Promise<void> {
  const withoutExisting = getRecentProblems(memento).filter((p) => p.id !== entry.id);
  const updated = [entry, ...withoutExisting].slice(0, MAX_RECENT);
  await memento.update(RECENT_PROBLEMS_KEY, updated);
}
