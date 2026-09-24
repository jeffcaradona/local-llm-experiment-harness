import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sourceIdentity } from '../src/harness/source-hash.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const provider = new URL('./support/mock-provider.mjs', import.meta.url).href;
const originalTemplate = 'Write a greeting with a {target}-word count';
const originalTemplates = [
  originalTemplate,
  'Write a greeting with {target} words',
  'Write a greeting with exactly {target} words',
  'Write a {target}-word greeting',
  'Write a greeting. Word count: {target}',
  'Write a greeting with {spelledNumber} words',
  'Write a greeting with exactly {spelledNumber} words',
];

async function runHarness(t, { env = {}, templates, args = ['1'], defaults = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'greeting-compatibility-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outDir = join(directory, 'results');
  const templatePath = join(directory, 'templates.txt');
  if (templates !== undefined) await writeFile(templatePath, templates);

  // Keep developer shell settings from changing the experiment under test.
  const childEnv = { ...process.env };
  for (const key of [
    'BASE_URL', 'MODEL', 'OUT_DIR', 'TARGETS', 'TEMPERATURES', 'MAX_TOKENS_LIST',
    'PROMPT_TEMPLATES_FILE', 'BASE_SEED', 'THRESHOLD', 'TIMEOUT_MS',
    'HARNESS_TEST_SCENARIO', 'NODE_OPTIONS',
  ]) delete childEnv[key];
  Object.assign(childEnv, { OUT_DIR: outDir });
  if (!defaults) Object.assign(childEnv, {
    BASE_URL: 'http://mock-provider.invalid/v1',
    MODEL: 'fixture-model',
    TARGETS: '2',
    PROMPT_TEMPLATES_FILE: templatePath,
  });
  Object.assign(childEnv, env);

  const child = spawnSync(process.execPath, ['--import', provider, 'greeting-harness-v2.5.mjs', ...args], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  assert.ok([0, 1, 2].includes(child.status), child.stderr);
  if (child.status === 2) {
    const files = await readdir(outDir).catch((err) => {
      if (err.code === 'ENOENT') return [];
      throw err;
    });
    const report = files.length ? JSON.parse(await readFile(join(outDir, files[0]), 'utf8')) : null;
    return { ...child, report };
  }
  assert.equal(child.stderr, '', `unexpected CLI error: ${child.stderr}`);
  const files = await readdir(outDir);
  assert.equal(files.length, 1, 'one result artifact per invocation');
  const report = JSON.parse(await readFile(join(outDir, files[0]), 'utf8'));
  assert.equal(report.complete, true);
  assert.ok(Number.isFinite(Date.parse(report.startedAt)));
  assert.ok(Number.isFinite(Date.parse(report.finishedAt)));
  assert.match(report.scriptHash, /^[a-f0-9]{16}$/);
  assert.equal(report.workload, 'greeting');
  const { scriptHash, harnessHash, sourceHashes } = report;
  assert.deepEqual({ scriptHash, harnessHash, sourceHashes }, await sourceIdentity());
  return { ...child, report };
}

test('v2.5 defaults and original prompt wording remain reproducible', async (t) => {
  const { status, report } = await runHarness(t, { defaults: true, args: [] });
  assert.equal(status, 1); // The mock always returns two words, not ten or eight.
  assert.equal(report.harness, 'greeting-harness-v2.5');
  assert.equal(report.environment.baseUrl, 'http://redshift:11434/v1');
  assert.equal(report.environment.model, 'nemotron-3-nano:4b');
  assert.equal(report.environment.modelDigest, null);
  assert.deepEqual(report.params, {
    runsPerCondition: 10,
    targets: [10, 8],
    temperatures: [0],
    maxTokensList: [3200],
    promptTemplatesFile: './prompt-templates.txt',
    promptTemplates: originalTemplates,
    baseSeed: 1,
    threshold: 0.8,
    timeoutMs: 180_000,
  });
  assert.equal(report.results.length, 140);
  assert.equal(report.matrix.length, 14);
  assert.equal(report.results[0].prompt, 'Write a greeting with a 10-word count');
  assert.equal(report.results[50].prompt, 'Write a greeting with ten words');
  assert.equal(report.results[120].prompt, 'Write a greeting with eight words');
});

test('sweep order, seed reset, substitutions, and model request parameters are preserved', async (t) => {
  const { status, report } = await runHarness(t, {
    templates: '# ignored\n\n  {target}/{spelledNumber}/{target}  \nGreeting {spelledNumber}\n',
    args: ['2'],
    env: { TARGETS: '21,2', TEMPERATURES: '0.7,0', MAX_TOKENS_LIST: '64,32', BASE_SEED: '5', THRESHOLD: '0', TIMEOUT_MS: '2500' },
  });
  assert.equal(status, 0);
  assert.equal(report.environment.modelDigest, 'fixture-digest');
  assert.equal(report.params.timeoutMs, 2500);
  assert.deepEqual(report.params.promptTemplates, ['{target}/{spelledNumber}/{target}', 'Greeting {spelledNumber}']);
  const conditions = [
    [21, 0.7, 64], [21, 0.7, 32], [21, 0, 64], [21, 0, 32],
    [2, 0.7, 64], [2, 0.7, 32], [2, 0, 64], [2, 0, 32],
  ].flatMap(([target, temperature, maxTokens]) => [
    [target, temperature, maxTokens, '{target}/{spelledNumber}/{target}'],
    [target, temperature, maxTokens, 'Greeting {spelledNumber}'],
  ]);
  assert.deepEqual(report.matrix.map((r) => [r.target, r.temperature, r.maxTokens, r.template]), conditions);
  assert.deepEqual(report.results.map((r) => [r.target, r.temperature, r.maxTokens, r.template, r.seed, r.run]),
    conditions.flatMap((condition) => [[...condition, 5, 1], [...condition, 6, 2]]));
  assert.equal(report.results[0].prompt, '21/21/21');
  assert.equal(report.results[16].prompt, '2/two/2');
  for (const row of report.results) {
    assert.deepEqual(row.request, {
      model: 'fixture-model', messages: [{ role: 'user', content: row.prompt }],
      stream: false, temperature: row.temperature, seed: row.seed,
      max_tokens: row.maxTokens, options: { num_predict: row.maxTokens },
    });
  }
});

for (const [name, templates] of [['missing', undefined], ['empty', '# comments only\n\n']]) {
  test(`${name} template file falls back to the original prompt`, async (t) => {
    const { status, stdout, report } = await runHarness(t, { templates });
    assert.equal(status, 0);
    assert.match(stdout, /falling back to the single default template/);
    assert.equal(report.params.promptTemplatesFile, null);
    assert.deepEqual(report.params.promptTemplates, [originalTemplate]);
    assert.equal(report.results[0].prompt, 'Write a greeting with a 2-word count');
  });
}

test('word-count pass semantics, truncation, errors, and threshold boundary are preserved', async (t) => {
  for (const [threshold, expectedStatus] of [['0.25', 0], ['0.5', 1]]) {
    const { status, report } = await runHarness(t, {
      args: ['4'], env: { BASE_SEED: '5', THRESHOLD: threshold, HARNESS_TEST_SCENARIO: 'mixed' },
    });
    assert.equal(status, expectedStatus);
    const [pass, wrongCount, error, empty] = report.results;
    // Historical pass is solely word count; a length stop does not veto it.
    assert.equal(pass.pass, true);
    assert.equal(pass.truncated, true);
    assert.equal(pass.finishReason, 'length');
    assert.equal(pass.text, 'Hello\tthere!');
    assert.equal(pass.wordCount, 2);
    assert.equal(pass.reasoning, 'Count two words');
    assert.equal(pass.reasoningLength, 3);
    assert.equal(pass.completionTokens, 5);
    assert.equal(wrongCount.pass, false);
    assert.equal(wrongCount.wordCount, 1);
    assert.equal(error.error, 'HTTP 500: Mock failure');
    assert.equal(error.pass, false);
    assert.equal(error.truncated, false);
    assert.equal(empty.text, '');
    assert.equal(empty.wordCount, 0);
    assert.equal(empty.pass, false);
    assert.equal(empty.finishReason, null);
    assert.equal(empty.completionTokens, null);
    assert.equal(empty.reasoningLength, null);
    assert.deepEqual(report.matrix[0], {
      target: 2, temperature: 0, maxTokens: 3200, template: originalTemplate,
      passCount: 1, truncatedCount: 1, avgReasoningLength: 3, runs: 4, passRate: 0.25,
    });
    assert.equal(report.failingConditions.length, expectedStatus);
  }
});

test('provider discovery failure exits with the fatal-error status', async (t) => {
  const { status, stderr } = await runHarness(t, { env: { HARNESS_TEST_SCENARIO: 'unavailable' } });
  assert.equal(status, 2);
  assert.match(stderr, /Mock provider unavailable/);
});

test('initial and per-attempt checkpoints precede subsequent model calls', async (t) => {
  const { status, report } = await runHarness(t, { args: ['3'], env: { HARNESS_TEST_SCENARIO: 'checkpoints' } });
  assert.equal(status, 0);
  assert.equal(report.results.length, 3);
  assert.ok(report.results.every((row) => row.pass));
});

test('evaluation failures are fatal and do not become provider-error rows', async (t) => {
  const { status, stderr, report } = await runHarness(t, { env: { HARNESS_TEST_SCENARIO: 'evaluation-error' } });
  assert.equal(status, 2);
  assert.match(stderr, /trim is not a function/);
  assert.equal(report.complete, false);
  assert.deepEqual(report.results, []);
});
