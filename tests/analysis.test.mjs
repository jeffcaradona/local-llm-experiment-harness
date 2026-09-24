import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { extractRecords } from '../src/analysis/result-records.mjs';

const cli = fileURLToPath(new URL('../src/analysis/analyze-results.mjs', import.meta.url));

function fixture() {
  return {
    harness: 'greeting-harness-v2.5',
    scriptHash: 'legacy-script',
    startedAt: '2026-09-24T00:46:57.104Z',
    complete: true,
    environment: { model: 'fixture-model', modelDigest: 'fixture-digest' },
    results: [{
      target: 2, temperature: 0, maxTokens: 3200, seed: 1, run: 1,
      template: 'Greeting with {target} words', prompt: 'Greeting with 2 words',
      text: 'Hello there', pass: true, wordCount: 2, finishReason: 'length',
      completionTokens: 0, reasoningLength: 12, truncated: true,
    }],
  };
}

function runCli(paths, cwd) {
  const child = spawnSync(process.execPath, [cli, ...paths], {
    cwd, encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  return child;
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'analysis-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('legacy evidence becomes an explicit analysis record without invented telemetry', () => {
  const artifact = fixture();
  const original = JSON.parse(JSON.stringify(artifact));
  assert.deepEqual(extractRecords(artifact, 'legacy.json'), [{
    source: 'legacy.json', resultIndex: 0, workload: 'greeting',
    harness: 'greeting-harness-v2.5', scriptHash: 'legacy-script', harnessHash: null,
    startedAt: '2026-09-24T00:46:57.104Z', complete: true,
    model: 'fixture-model', modelDigest: 'fixture-digest',
    target: 2, temperature: 0, maxTokens: 3200,
    template: 'Greeting with {target} words', prompt: 'Greeting with 2 words',
    run: 1, seed: 1, promptTokens: null, completionTokens: 0,
    reasoningTokens: null, elapsedMs: null, passed: true,
    failureReason: null, error: null, finishReason: 'length',
  }]);
  assert.deepEqual(artifact, original);
});

test('extracted-workload identity is retained and checkpoints retain recorded attempts', () => {
  const artifact = fixture();
  Object.assign(artifact, { workload: 'greeting', harnessHash: 'all-sources', complete: false });
  artifact.results.push({ ...artifact.results[0], target: 10, pass: false, completionTokens: 3200 });
  const records = extractRecords(artifact, 'checkpoint.json');
  assert.deepEqual(records.map((r) => [r.resultIndex, r.target, r.passed]), [[0, 2, true], [1, 10, false]]);
  assert.equal(records[1].failureReason, 'word_count_mismatch');
  assert.equal(records[1].finishReason, 'length');
  assert.ok(records.every((r) => r.harnessHash === 'all-sources' && r.complete === false));
  artifact.results = [];
  assert.deepEqual(extractRecords(artifact, 'empty.json'), []);
});

test('provider failures need no response fields and missing token usage stays null', () => {
  const artifact = fixture();
  artifact.results = [{
    target: 2, temperature: 0.7, maxTokens: 64, seed: 3, run: 2,
    template: 'Greeting', prompt: 'Greeting', pass: false, error: 'HTTP 500: unavailable',
  }];
  const [record] = extractRecords(artifact, 'error.json');
  assert.equal(record.passed, false);
  assert.equal(record.failureReason, 'provider_error');
  assert.equal(record.error, 'HTTP 500: unavailable');
  assert.equal(record.completionTokens, null);
  assert.equal(record.finishReason, null);
  delete artifact.results[0].error;
  artifact.results[0].completionTokens = null;
  assert.equal(extractRecords(artifact, 'null.json')[0].completionTokens, null);
});

test('unrelated raw fields and summaries do not determine recorded pass/fail', () => {
  const artifact = fixture();
  artifact.matrix = [{ passRate: 0 }];
  artifact.results[0].text = 'Not re-evaluated by this consumer';
  artifact.results[0].wordCount = 99;
  artifact.results[0].request = { model: 'unrelated' };
  assert.equal(extractRecords(artifact, 'recorded.json')[0].passed, true);
});

test('unsupported or malformed artifact metadata fails with source and field context', () => {
  for (const value of [null, [], 'text', 42]) {
    assert.throws(() => extractRecords(value, 'bad.json'), /bad\.json: expected an object/);
  }
  const cases = [
    ['harness', undefined], ['harness', 'unknown-harness'], ['workload', 'other'],
    ['workload', null], ['startedAt', 'not a date'], ['startedAt', undefined],
    ['complete', 'true'], ['environment', null], ['environment.model', ''],
    ['environment.modelDigest', 42], ['results', {}], ['results', undefined],
    ['scriptHash', 42], ['harnessHash', []],
  ];
  for (const [field, value] of cases) {
    const artifact = fixture();
    const parts = field.split('.');
    const parent = parts.length === 2 ? artifact[parts[0]] : artifact;
    parent[parts.at(-1)] = value;
    assert.throws(() => extractRecords(artifact, 'bad.json'), (err) => {
      assert.ok(err.message.startsWith(`bad.json.${field}: expected`), err.message);
      return true;
    });
  }
});

test('malformed attempts identify their index and reject numeric/string coercion', () => {
  const cases = [
    ['target', '2'], ['target', -1], ['target', 1.5], ['target', undefined],
    ['temperature', '0'], ['temperature', Infinity], ['maxTokens', 0],
    ['maxTokens', null], ['run', 0], ['seed', 1.5], ['seed', Number.MAX_SAFE_INTEGER + 1],
    ['template', ''], ['prompt', null], ['pass', 'false'], ['pass', undefined],
    ['completionTokens', -1], ['completionTokens', 1.5], ['completionTokens', '5'],
    ['finishReason', {}], ['error', false],
  ];
  for (const [field, value] of cases) {
    const artifact = fixture();
    artifact.results.push({ ...artifact.results[0], [field]: value });
    assert.throws(() => extractRecords(artifact, 'bad.json'), (err) => {
      assert.ok(err.message.startsWith(`bad.json.results[1].${field}: expected`), err.message);
      return true;
    });
  }
  const artifact = fixture();
  artifact.results = [null];
  assert.throws(() => extractRecords(artifact, 'bad.json'), /results\[0\]: expected an object/);
});

test('CLI emits repeatable JSON in argument order, preserves duplicates, and works outside the repo', async (t) => {
  const directory = await temporaryDirectory(t);
  const first = fixture();
  const second = fixture();
  second.results[0].target = 10;
  second.results[0].pass = false;
  await writeFile(join(directory, 'z first.json'), JSON.stringify(first));
  await writeFile(join(directory, 'a-second.json'), JSON.stringify(second));
  const paths = ['z first.json', 'a-second.json', 'z first.json'];
  const child = runCli(paths, directory);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  assert.deepEqual(JSON.parse(child.stdout), [
    ...extractRecords(first, paths[0]), ...extractRecords(second, paths[1]), ...extractRecords(first, paths[2]),
  ]);
  assert.equal(runCli(paths, directory).stdout, child.stdout);
  assert.equal(await readFile(join(directory, paths[0]), 'utf8'), JSON.stringify(first));
});

test('CLI errors leave stdout empty, including when a later input fails', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(join(directory, 'valid.json'), JSON.stringify(fixture()));
  await writeFile(join(directory, 'syntax.json'), '{');
  await writeFile(join(directory, 'shape.json'), JSON.stringify({ results: [] }));
  for (const name of ['missing.json', 'syntax.json', 'shape.json']) {
    const child = runCli(['valid.json', name], directory);
    assert.equal(child.status, 2);
    assert.equal(child.stdout, '');
    assert.ok(child.stderr.startsWith(name), child.stderr);
  }
});

test('CLI documents explicit inputs instead of silently scanning the results directory', () => {
  const missing = runCli([]);
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /Usage: npm run analyze/);
  const help = runCli(['--help']);
  assert.equal(help.status, 0);
  assert.equal(help.stderr, '');
  assert.match(help.stdout, /Usage: npm run analyze/);
});

test('retained historical artifacts remain independently readable with one record per attempt', async () => {
  for (const name of ['2026-09-24T00-46-57-104Z.json', '2026-09-24T01-20-38-508Z.json']) {
    const artifact = JSON.parse(await readFile(new URL(`../results/${name}`, import.meta.url), 'utf8'));
    const records = extractRecords(artifact, name);
    assert.equal(records.length, artifact.results.length);
    assert.ok(records.length > 0);
    assert.deepEqual(records.map((r) => r.passed), artifact.results.map((r) => r.pass));
    assert.deepEqual(records.map((r) => [r.target, r.temperature, r.maxTokens, r.template, r.seed]),
      artifact.results.map((r) => [r.target, r.temperature, r.maxTokens, r.template, r.seed]));
    assert.ok(records.every((r) => r.reasoningTokens === null && r.elapsedMs === null));
  }
});

test('a newly generated mock-provider artifact flows through the independent analysis CLI', async (t) => {
  const directory = await temporaryDirectory(t);
  const outDir = join(directory, 'results');
  const templatePath = join(directory, 'templates.txt');
  await writeFile(templatePath, 'Write a greeting with {target} words\n');
  const harness = fileURLToPath(new URL('../greeting-harness-v2.5.mjs', import.meta.url));
  const provider = new URL('./support/mock-provider.mjs', import.meta.url).href;
  const experiment = spawnSync(process.execPath, ['--import', provider, harness, '4'], {
    cwd: directory, encoding: 'utf8', timeout: 15_000,
    env: {
      ...process.env, NODE_OPTIONS: '', HARNESS_TEST_SCENARIO: 'mixed',
      BASE_URL: 'http://mock-provider.invalid/v1', MODEL: 'fixture-model',
      OUT_DIR: outDir, TARGETS: '2', TEMPERATURES: '0', MAX_TOKENS_LIST: '64',
      PROMPT_TEMPLATES_FILE: templatePath, BASE_SEED: '5', THRESHOLD: '0.5', TIMEOUT_MS: '2500',
    },
  });
  assert.ifError(experiment.error);
  assert.equal(experiment.status, 1, experiment.stderr);
  const files = await readdir(outDir);
  assert.equal(files.length, 1);
  const path = join(outDir, files[0]);
  const artifact = JSON.parse(await readFile(path, 'utf8'));
  const analysis = runCli([path], directory);
  assert.equal(analysis.status, 0, analysis.stderr);
  const records = JSON.parse(analysis.stdout);
  assert.equal(records.length, 4);
  assert.deepEqual(records.map((r) => r.passed), [true, false, false, false]);
  assert.deepEqual(records.map((r) => r.failureReason), [
    null, 'word_count_mismatch', 'provider_error', 'word_count_mismatch',
  ]);
  assert.ok(records.every((r) => r.harnessHash === artifact.harnessHash));
  assert.match(records[0].harnessHash, /^[a-f0-9]{16}$/);
  assert.equal(records[0].modelDigest, 'fixture-digest');
});
