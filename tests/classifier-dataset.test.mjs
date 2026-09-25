import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { extractRecords } from '../src/analysis/result-records.mjs';
import { buildDataset, featuresFor, FEATURE_NAMES, labelFor } from '../src/classifier/dataset.mjs';

// A complete synthetic sweep in harness order: target, temperature, then run.
// It passes through the real analysis boundary, as classifier inputs must.
function sweepRecords({ targets = [2, 10], temperatures = [0, 0.7], runs = 10, fails = () => false } = {}) {
  const results = [];
  for (const target of targets) {
    for (const temperature of temperatures) {
      for (let run = 1; run <= runs; run++) {
        results.push({
          target, temperature, maxTokens: 3200, seed: run, run,
          template: 'Write a greeting with a {target}-word count',
          prompt: `Write a greeting with a ${target}-word count`,
          pass: !fails(target, temperature, run),
        });
      }
    }
  }
  const artifact = {
    harness: 'greeting-harness-v2.5', workload: 'greeting', scriptHash: 'script', harnessHash: 'harness',
    startedAt: '2026-09-24T00:46:57.104Z', complete: true,
    environment: { model: 'fixture-model', modelDigest: 'fixture-digest' }, results,
  };
  return extractRecords(artifact, 'sweep.json');
}

async function retainedRecords(name) {
  const artifact = JSON.parse(await readFile(new URL(`../results/${name}`, import.meta.url), 'utf8'));
  return extractRecords(artifact, name);
}

test('features are exactly target and temperature, in a stable order, ignoring post-run evidence', () => {
  assert.deepEqual(FEATURE_NAMES, ['target', 'temperature']);
  assert.ok(Object.isFrozen(FEATURE_NAMES));
  const [record] = sweepRecords();
  const leaky = {
    ...record, passed: false, failureReason: 'word_count_mismatch', error: 'HTTP 500',
    finishReason: 'length', completionTokens: 3200, reasoningTokens: 99, promptTokens: 12,
    elapsedMs: 1234, run: 9, seed: 42, maxTokens: 1, prompt: 'changed', template: 'changed',
  };
  assert.deepEqual(featuresFor(record), [2, 0]);
  assert.deepEqual(featuresFor(leaky), featuresFor(record));
});

test('labels come from the recorded verdict with FAIL as the positive class', () => {
  const records = sweepRecords({ targets: [10], temperatures: [0], fails: (_t, _temp, run) => run % 2 === 0 });
  assert.deepEqual(records.map(labelFor), [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  // A length stop or missing telemetry does not change a recorded pass.
  assert.equal(labelFor({ ...records[0], finishReason: 'length', completionTokens: null }), 0);
  for (const passed of [undefined, null, 'false', 0]) {
    assert.throws(() => labelFor({ ...records[0], passed }), /expected a boolean recorded verdict/);
  }
});

test('runs 1-8 train and runs 9-10 evaluate, preserving experiment order on every call', () => {
  const records = sweepRecords({ fails: (target, temperature) => target === 10 && temperature === 0 });
  const dataset = buildDataset(records);
  assert.equal(dataset.split, 'runs 1-8 train; runs 9-10 evaluation');
  assert.deepEqual(dataset.featureNames, ['target', 'temperature']);
  assert.equal(dataset.training.length, 32);
  assert.equal(dataset.evaluation.length, 8);
  assert.ok(dataset.training.every((example) => example.run <= 8));
  assert.ok(dataset.evaluation.every((example) => example.run >= 9));
  assert.deepEqual(dataset.evaluation.map((e) => [e.resultIndex, ...e.features, e.label]), [
    [8, 2, 0, 0], [9, 2, 0, 0], [18, 2, 0.7, 0], [19, 2, 0.7, 0],
    [28, 10, 0, 1], [29, 10, 0, 1], [38, 10, 0.7, 0], [39, 10, 0.7, 0],
  ]);
  assert.deepEqual(buildDataset(records), dataset);
  assert.deepEqual(dataset.source, {
    path: 'sweep.json', harness: 'greeting-harness-v2.5', scriptHash: 'script', harnessHash: 'harness',
    startedAt: '2026-09-24T00:46:57.104Z', modelDigest: 'fixture-digest', conditionCount: 4,
    model: 'fixture-model', maxTokens: 3200, template: 'Write a greeting with a {target}-word count',
  });
});

test('datasets that cannot satisfy the split or pool different experiments are rejected', () => {
  const cases = [
    [[], /nonempty array/],
    [sweepRecords({ runs: 9 }), /target=2 temperature=0: expected runs 1-10 exactly once, found 1,2,3,4,5,6,7,8,9$/],
    [sweepRecords({ runs: 11 }), /expected runs 1-10 exactly once/],
    [[...sweepRecords(), sweepRecords()[0]], /target=2 temperature=0: expected runs 1-10 exactly once/],
    [sweepRecords().map((r, i) => (i === 0 ? { ...r, complete: false } : r)), /incomplete checkpoint/],
    [[...sweepRecords(), ...sweepRecords().map((r) => ({ ...r, source: 'other.json' }))], /source: expected one value/],
    [sweepRecords().map((r, i) => (i === 3 ? { ...r, maxTokens: 64 } : r)), /maxTokens: expected one value/],
    [sweepRecords().map((r, i) => (i === 3 ? { ...r, template: 'other' } : r)), /template: expected one value/],
  ];
  for (const [records, message] of cases) {
    assert.throws(() => buildDataset(records), message);
  }
});

test('the retained fixed-prompt sweep splits 160/40 with the recorded failures in place', async () => {
  const records = await retainedRecords('2026-09-24T00-46-57-104Z.json');
  const { training, evaluation, source } = buildDataset(records);
  assert.equal(training.length, 160);
  assert.equal(evaluation.length, 40);
  assert.equal(source.conditionCount, 20);
  assert.equal(source.maxTokens, 3200);
  assert.equal(training.filter((e) => e.label === 1).length, 9);
  assert.deepEqual(evaluation.filter((e) => e.label === 1).map((e) => [...e.features, e.run]), [
    [10, 0, 9], [10, 0, 10],
  ]);
  // The seven-template default run would silently pool prompts, so it is refused.
  const multiTemplate = await retainedRecords('2026-09-24T01-20-38-508Z.json');
  assert.throws(() => buildDataset(multiTemplate), /template: expected one value across the dataset, found 7/);
});

test('classifier modules consume analysis records rather than execution code', async () => {
  const directory = new URL('../src/classifier/', import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.mjs'));
  assert.ok(names.length > 0);
  for (const name of names) {
    const source = await readFile(new URL(name, directory), 'utf8');
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.doesNotMatch(specifier, /harness|workloads|greeting/, `${name} imports ${specifier}`);
    }
  }
});
