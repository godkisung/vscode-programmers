import type { Memento } from 'vscode';
import { SampleTestRun } from './core/types';

export interface CurrentProblem {
  id: string;
  title: string;
  dir: string;
  url: string;
}

export type ConnectionStatus = 'unknown' | 'ok' | 'expired' | 'none';

export interface Disposable {
  dispose(): void;
}

type Listener<T> = (e: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  event = (listener: Listener<T>): Disposable => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(e: T): void {
    for (const listener of [...this.listeners]) listener(e);
  }
}

const CURRENT_PROBLEM_KEY = 'programmers.currentProblem';

export class ExtensionState {
  private _currentProblem: CurrentProblem | undefined;
  private _connection: ConnectionStatus = 'unknown';
  private _lastRun: SampleTestRun | undefined;

  private problemEmitter = new Emitter<CurrentProblem | undefined>();
  private connectionEmitter = new Emitter<ConnectionStatus>();
  private testResultsEmitter = new Emitter<SampleTestRun | undefined>();

  readonly onDidChangeProblem = this.problemEmitter.event;
  readonly onDidChangeConnection = this.connectionEmitter.event;
  readonly onDidChangeTestResults = this.testResultsEmitter.event;

  constructor(private workspaceState: Memento) {}

  get currentProblem(): CurrentProblem | undefined {
    return this._currentProblem;
  }

  get connection(): ConnectionStatus {
    return this._connection;
  }

  get lastRun(): SampleTestRun | undefined {
    return this._lastRun;
  }

  /** 창 재시작 후 저장된 현재 문제를 복원한다. validate가 false를 반환하면(예: 폴더 삭제됨) 버린다. */
  restore(validate: (problem: CurrentProblem) => boolean): void {
    const saved = this.workspaceState.get<CurrentProblem>(CURRENT_PROBLEM_KEY);
    if (saved && validate(saved)) {
      this._currentProblem = saved;
      this.problemEmitter.fire(saved);
    }
  }

  async setCurrentProblem(problem: CurrentProblem | undefined): Promise<void> {
    this._currentProblem = problem;
    if (this._lastRun) {
      this._lastRun = undefined;
      this.testResultsEmitter.fire(undefined);
    }
    await this.workspaceState.update(CURRENT_PROBLEM_KEY, problem);
    this.problemEmitter.fire(problem);
  }

  setConnection(status: ConnectionStatus): void {
    if (this._connection === status) return;
    this._connection = status;
    this.connectionEmitter.fire(status);
  }

  setLastRun(run: SampleTestRun | undefined): void {
    this._lastRun = run;
    this.testResultsEmitter.fire(run);
  }
}
