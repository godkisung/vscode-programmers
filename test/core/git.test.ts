import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildCommitMessage,
  classifyPullFailure,
  describePullFailure,
  findRepoRoot,
  hasUnpushedCommits,
  pullRebase,
  runGit,
  stageAndCommit,
} from '../../src/core/git';

describe('buildCommitMessage', () => {
  test('names the problem so git log doubles as a study record', () => {
    expect(buildCommitMessage({ id: '12973', title: '짝지어 제거하기' })).toBe(
      'solve(12973): 짝지어 제거하기'
    );
  });

  test('collapses whitespace in the title', () => {
    expect(buildCommitMessage({ id: '1', title: '  a   b  ' })).toBe('solve(1): a b');
  });

  test('falls back to the id alone when the title is empty', () => {
    expect(buildCommitMessage({ id: '1', title: '   ' })).toBe('solve(1)');
  });
});

describe('classifyPullFailure', () => {
  test.each([
    ['CONFLICT (content): Merge conflict in a.py', 'conflict'],
    ['error: could not apply 1234567... solve(1)', 'conflict'],
    ['There is no tracking information for the current branch.', 'no-upstream'],
    ['error: cannot pull with rebase: You have unstaged changes.', 'dirty'],
    ['fatal: could not resolve host: github.com', 'network'],
    ['fatal: unable to access https://github.com/x: Timed out', 'network'],
    ['something else entirely', 'unknown'],
  ])('classifies %s', (stderr, expected) => {
    expect(classifyPullFailure(stderr)).toBe(expected);
  });

  test('every failure kind has a message for the user', () => {
    for (const reason of ['conflict', 'no-upstream', 'dirty', 'network', 'unknown'] as const) {
      expect(describePullFailure(reason).length).toBeGreaterThan(0);
    }
  });

  test('tells the user conflicts are theirs to resolve', () => {
    expect(describePullFailure('conflict')).toContain('자동으로 해결하지 않');
  });
});

describe('git operations against a real repository', () => {
  let repo: string;
  let dataDir: string;

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim();

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsync-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');

    dataDir = path.join(repo, 'solutions', '12973');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(repo, 'README.md'), 'root file\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  test('findRepoRoot resolves from a nested directory', async () => {
    expect(await findRepoRoot(dataDir)).toBe(fs.realpathSync(repo));
  });

  test('findRepoRoot returns undefined outside any repository', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
    try {
      expect(await findRepoRoot(plain)).toBeUndefined();
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  test('commits only what lives under the given path', async () => {
    // 데이터 폴더가 소스 코드와 같은 저장소에 있을 수 있다. 작업 중이던
    // 코드까지 함께 커밋되면 안 된다.
    fs.writeFileSync(path.join(dataDir, 'solution.py'), 'print(1)\n');
    fs.writeFileSync(path.join(repo, 'README.md'), '작업 중이던 다른 변경\n');

    const committed = await stageAndCommit(repo, dataDir, 'solve(12973): 짝지어 제거하기');
    expect(committed).toBe(true);

    const files = git('show', '--name-only', '--pretty=format:', 'HEAD').split('\n').filter(Boolean);
    expect(files).toEqual(['solutions/12973/solution.py']);
    expect(git('status', '--porcelain')).toContain('README.md');
  });

  test('reports nothing to commit instead of creating an empty commit', async () => {
    const before = git('rev-parse', 'HEAD');
    expect(await stageAndCommit(repo, dataDir, 'msg')).toBe(false);
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  test('pull fails cleanly when there is no upstream', async () => {
    const outcome = await pullRebase(repo);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(['no-upstream', 'network', 'unknown']).toContain(outcome.reason);
    }
  });

  test('hasUnpushedCommits is false without an upstream rather than throwing', async () => {
    await expect(hasUnpushedCommits(repo)).resolves.toBe(false);
  });

  test('runGit surfaces the exit code instead of throwing', async () => {
    const result = await runGit(['rev-parse', '--verify', 'does-not-exist'], repo);
    expect(result.code).not.toBe(0);
  });
});

describe('syncing between two clones', () => {
  let origin: string;
  let alice: string;
  let bob: string;

  const runIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

  const setUser = (cwd: string) => {
    runIn(cwd, 'config', 'user.email', 'test@example.com');
    runIn(cwd, 'config', 'user.name', 'test');
  };

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gitclones-'));
    origin = path.join(base, 'origin.git');
    alice = path.join(base, 'alice');
    bob = path.join(base, 'bob');

    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['clone', '-q', origin, alice]);
    setUser(alice);
    fs.mkdirSync(path.join(alice, 'solutions', '12973'), { recursive: true });
    fs.writeFileSync(path.join(alice, 'solutions', '12973', 'solution.py'), 'v1\n');
    runIn(alice, 'add', '-A');
    runIn(alice, 'commit', '-q', '-m', 'init');
    runIn(alice, 'push', '-q', '-u', 'origin', 'main');

    execFileSync('git', ['clone', '-q', origin, bob]);
    setUser(bob);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(origin), { recursive: true, force: true });
  });

  test('a machine picks up what the other one solved', async () => {
    const bobProblem = path.join(bob, 'solutions', '12924');
    fs.mkdirSync(bobProblem, { recursive: true });
    fs.writeFileSync(path.join(bobProblem, 'solution.py'), 'bob\n');
    await stageAndCommit(bob, bobProblem, 'solve(12924): 숫자의 표현');
    runIn(bob, 'push', '-q');

    const outcome = await pullRebase(alice);
    expect(outcome).toEqual({ ok: true, changed: true });
    expect(fs.existsSync(path.join(alice, 'solutions', '12924', 'solution.py'))).toBe(true);
  });

  test('different problems on both machines merge without conflict', async () => {
    fs.mkdirSync(path.join(bob, 'solutions', '12924'), { recursive: true });
    fs.writeFileSync(path.join(bob, 'solutions', '12924', 'solution.py'), 'bob\n');
    await stageAndCommit(bob, path.join(bob, 'solutions', '12924'), 'solve(12924)');
    runIn(bob, 'push', '-q');

    fs.mkdirSync(path.join(alice, 'solutions', '12911'), { recursive: true });
    fs.writeFileSync(path.join(alice, 'solutions', '12911', 'solution.py'), 'alice\n');
    await stageAndCommit(alice, path.join(alice, 'solutions', '12911'), 'solve(12911)');

    expect(await pullRebase(alice)).toEqual({ ok: true, changed: true });
    expect(fs.existsSync(path.join(alice, 'solutions', '12924', 'solution.py'))).toBe(true);
    expect(fs.existsSync(path.join(alice, 'solutions', '12911', 'solution.py'))).toBe(true);
  });

  test('hasUnpushedCommits sees local work waiting to go out', async () => {
    fs.writeFileSync(path.join(alice, 'solutions', '12973', 'solution.py'), 'v2\n');
    await stageAndCommit(alice, path.join(alice, 'solutions', '12973'), 'solve(12973)');
    await expect(hasUnpushedCommits(alice)).resolves.toBe(true);
  });

  test('the same problem edited on both machines stops instead of guessing', async () => {
    fs.writeFileSync(path.join(bob, 'solutions', '12973', 'solution.py'), 'bob edit\n');
    await stageAndCommit(bob, path.join(bob, 'solutions', '12973'), 'solve(12973) bob');
    runIn(bob, 'push', '-q');

    fs.writeFileSync(path.join(alice, 'solutions', '12973', 'solution.py'), 'alice edit\n');
    await stageAndCommit(alice, path.join(alice, 'solutions', '12973'), 'solve(12973) alice');

    const outcome = await pullRebase(alice);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('conflict');

    // 충돌 후 저장소는 rebase 중간 상태로 방치되지 않아야 한다.
    expect(runIn(alice, 'status', '--porcelain')).toBe('');
  });
});
