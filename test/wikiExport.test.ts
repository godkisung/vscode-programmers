import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_EXPORT_COMMAND, WikiExportError, expandCommand, runExport } from '../src/wikiExport';

describe('expandCommand', () => {
  test('substitutes the problem id', () => {
    expect(expandCommand('python tools/export.py ${problemId}', '12973')).toBe(
      'python tools/export.py 12973'
    );
  });

  test('substitutes every occurrence', () => {
    expect(expandCommand('${problemId} ${problemId}', '1')).toBe('1 1');
  });

  test('leaves a command without placeholders alone', () => {
    expect(expandCommand('python tools/export.py --all', '1')).toBe('python tools/export.py --all');
  });

  test('the default command targets the single problem', () => {
    expect(DEFAULT_EXPORT_COMMAND).toContain('${problemId}');
  });
});

describe('runExport', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'wikiexport-'));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  test('returns the output on success', async () => {
    await expect(runExport({ cwd, problemId: '12973', command: 'echo ${problemId}' })).resolves.toBe(
      '12973'
    );
  });

  test('runs in the given directory', async () => {
    const output = await runExport({ cwd, problemId: '1', command: 'pwd' });
    expect(fs.realpathSync(output)).toBe(fs.realpathSync(cwd));
  });

  test('rejects with the output when the command fails', async () => {
    await expect(
      runExport({ cwd, problemId: '1', command: 'echo 무언가 잘못됨 && exit 3' })
    ).rejects.toThrow(/종료 코드 3[\s\S]*무언가 잘못됨/);
  });

  test('rejects when the command takes too long', async () => {
    await expect(
      runExport({ cwd, problemId: '1', command: 'sleep 5', timeoutMs: 200 })
    ).rejects.toBeInstanceOf(WikiExportError);
  });

  test('captures stderr too so failures are diagnosable', async () => {
    await expect(
      runExport({ cwd, problemId: '1', command: 'echo 에러다 >&2 && exit 1' })
    ).rejects.toThrow(/에러다/);
  });
});
