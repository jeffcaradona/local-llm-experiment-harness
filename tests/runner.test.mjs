import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runExperiment } from '../src/harness/runner.mjs';

// This test-only task uses exact text equality, independent of greeting rules.
const workload = {
  id: 'exact-text-fixture',
  async loadTemplates(path) { return { templates: ['Return {target}'], source: path }; },
  promptFor(template, target) { return template.replace('{target}', target); },
  evaluate({ text }, target) {
    return { pass: text === target, failureReason: text === target ? null : 'text_mismatch', matchedText: text };
  },
  summarize(rows, runs) {
    const passCount = rows.filter((row) => row.pass).length;
    return { passCount, runs, passRate: passCount / runs };
  },
};

async function setup(t) {
  const outDir = await mkdtemp(join(tmpdir(), 'harness-runner-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  return {
    config: {
      harness: 'runner-fixture', baseUrl: 'http://fixture.invalid/v1', model: 'fixture-model',
      outDir, runsPerCondition: 2, targets: ['yes', 'no'], temperatures: [0],
      maxTokensList: [32], promptTemplatesFile: 'fixture-templates', baseSeed: 7,
      threshold: 0.5, timeoutMs: 1000,
    },
    workload,
    identity: { scriptHash: 'fixture-script', harnessHash: 'fixture-harness' },
  };
}

function mockProvider(t, generate) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/tags')) return Response.json({ models: [] });
    assert.equal(url, 'http://fixture.invalid/v1/chat/completions');
    return generate(JSON.parse(options.body));
  });
}

const reply = (text) => Response.json({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });

async function savedReport(outDir) {
  const files = await readdir(outDir);
  assert.equal(files.length, 1);
  return JSON.parse(await readFile(join(outDir, files[0]), 'utf8'));
}

test('runner accepts another workload and awaits checkpoints and presentation callbacks', async (t) => {
  const args = await setup(t);
  let calls = 0;
  const events = [];
  mockProvider(t, async (request) => {
    const saved = await savedReport(args.config.outDir);
    assert.equal(saved.complete, false);
    assert.equal(saved.finishedAt, null);
    assert.equal(saved.results.length, calls);
    assert.equal(saved.matrix.length, calls > 2 ? 1 : 0);
    assert.equal(request.seed, 7 + calls % 2);
    assert.equal(events.at(-1), calls ? `attempt:${calls}` : 'templates');
    calls++;
    if (calls === 2) throw new Error('fixture provider unavailable');
    return reply('yes');
  });
  const result = await runExperiment({
    ...args,
    async onTemplates(templates) {
      assert.deepEqual(templates, ['Return {target}']);
      assert.deepEqual(await readdir(args.config.outDir), []);
      events.push('templates');
    },
    async onAttempt(row) {
      assert.equal((await savedReport(args.config.outDir)).results.length, calls - 1);
      assert.equal(row.run, (calls - 1) % 2 + 1);
      events.push(`attempt:${calls}`);
    },
    async onMatrix(matrix) {
      assert.equal(matrix.length, 2);
      assert.equal((await savedReport(args.config.outDir)).complete, false);
      events.push('matrix');
    },
  });
  assert.equal(calls, 4);
  assert.deepEqual(events, ['templates', 'attempt:1', 'attempt:2', 'attempt:3', 'attempt:4', 'matrix']);
  assert.deepEqual(JSON.parse(await readFile(result.artifactPath, 'utf8')), result.report);
  assert.equal(result.allPassed, false);
  assert.equal(result.report.complete, true);
  assert.ok(Number.isFinite(Date.parse(result.report.finishedAt)));
  assert.equal(result.report.workload, workload.id);
  assert.equal(result.report.harness, args.config.harness);
  assert.equal(result.report.scriptHash, args.identity.scriptHash);
  assert.equal(result.report.params.promptTemplatesFile, 'fixture-templates');
  assert.deepEqual(result.report.results.map((row) => row.failureReason), [null, 'provider_error', 'text_mismatch', 'text_mismatch']);
  assert.equal(result.report.results[0].matchedText, 'yes');
  assert.equal('wordCount' in result.report.results[0], false);
  assert.deepEqual(result.report.matrix.map((row) => row.passRate), [0.5, 0]);
  assert.deepEqual(result.report.failingConditions, [result.report.matrix[1]]);
});

test('runner invocations keep their results separate and need no presentation callbacks', async (t) => {
  const args = await setup(t);
  args.config.targets = ['yes'];
  args.config.runsPerCondition = 1;
  mockProvider(t, () => reply('yes'));
  const first = await runExperiment(args);
  const firstBytes = await readFile(first.artifactPath, 'utf8');
  const second = await runExperiment(args);
  assert.equal(first.allPassed, true);
  assert.equal(second.allPassed, true);
  assert.notEqual(first.artifactPath, second.artifactPath);
  assert.notEqual(first.report.results, second.report.results);
  assert.notEqual(first.report.matrix, second.report.matrix);
  assert.equal(second.report.results.length, 1);
  assert.equal(second.report.results[0].seed, 7);
  assert.equal(second.report.matrix.length, 1);
  assert.equal(await readFile(first.artifactPath, 'utf8'), firstBytes);
});

test('runner stops on a checkpoint write failure instead of recording a provider error', async (t) => {
  const args = await setup(t);
  let calls = 0;
  let preservedPath;
  mockProvider(t, () => { calls++; return reply('yes'); });
  await assert.rejects(runExperiment({
    ...args,
    async onAttempt() {
      // Preserve the initial checkpoint, then block its path with a directory.
      const [filename] = await readdir(args.config.outDir);
      const artifactPath = join(args.config.outDir, filename);
      preservedPath = `${artifactPath}.saved`;
      await rename(artifactPath, preservedPath);
      await mkdir(artifactPath);
    },
  }), (err) => ['EISDIR', 'EPERM', 'EACCES'].includes(err.code));
  assert.equal(calls, 1);
  const saved = JSON.parse(await readFile(preservedPath, 'utf8'));
  assert.equal(saved.complete, false);
  assert.deepEqual(saved.results, []);
});
