import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fitStandardization, predictProbability, sigmoid, trainLogisticRegression,
} from '../src/classifier/logistic-regression.mjs';

const names = ['target', 'temperature'];
const options = { iterations: 2000, learningRate: 0.5, l2: 0 };

// Linearly separable: failures occur only at high targets, whatever the temperature.
function separable() {
  const examples = [];
  for (const target of [2, 4, 6, 8, 10, 12, 14, 16]) {
    for (const temperature of [0, 0.7]) {
      examples.push({ features: [target, temperature], label: target >= 10 ? 1 : 0 });
    }
  }
  return examples;
}

test('sigmoid is symmetric and stays finite for extreme scores', () => {
  assert.equal(sigmoid(0), 0.5);
  for (const z of [0.3, 5, 40]) assert.ok(Math.abs(sigmoid(z) + sigmoid(-z) - 1) < 1e-15);
  assert.equal(sigmoid(1000), 1);
  assert.equal(sigmoid(-1000), 0);
  assert.ok(Number.isFinite(sigmoid(-750)));
});

test('standardization uses the supplied rows and rejects zero-variance features', () => {
  assert.deepEqual(fitStandardization(names, [[2, 0], [4, 0.7], [6, 0], [8, 0.7]]), [
    { name: 'target', mean: 5, standardDeviation: Math.sqrt(5) },
    { name: 'temperature', mean: 0.35, standardDeviation: 0.35 },
  ]);
  assert.throws(() => fitStandardization(names, [[2, 0], [4, 0], [6, 0]]),
    /feature temperature: zero variance in training data/);
  const constantTarget = [0, 0.7, 0, 0.7].map((t) => ({ features: [10, t], label: 0 }));
  assert.throws(() => trainLogisticRegression(names, constantTarget, options), /feature target: zero variance/);
});

test('logistic regression learns a simple separable dataset', () => {
  const examples = separable();
  const model = trainLogisticRegression(names, examples, options);
  assert.ok(model.weights[0] > 1, `target weight ${model.weights[0]}`);
  assert.ok(Math.abs(model.weights[1]) < 0.1, `temperature weight ${model.weights[1]}`);
  for (const { features, label } of examples) {
    const probability = predictProbability(model, features);
    assert.equal(probability >= 0.5 ? 1 : 0, label, `features ${features}`);
  }
  assert.ok(predictProbability(model, [2, 0]) < 0.05);
  assert.ok(predictProbability(model, [16, 0.7]) > 0.95);
});

test('training is deterministic and depends only on the training examples', () => {
  const examples = separable();
  const first = trainLogisticRegression(names, examples, options);
  assert.deepEqual(trainLogisticRegression(names, structuredClone(examples), options), first);
  // Standardization comes from training rows only; the input is not mutated.
  const snapshot = structuredClone(examples);
  assert.deepEqual(first.features, fitStandardization(names, examples.map((e) => e.features)));
  assert.deepEqual(examples, snapshot);
  assert.deepEqual(first.features.map((f) => f.name), names);
});

test('L2 shrinks weights toward zero without penalizing the intercept', () => {
  const plain = trainLogisticRegression(names, separable(), options);
  const penalized = trainLogisticRegression(names, separable(), { ...options, l2: 0.1 });
  assert.ok(Math.abs(penalized.weights[0]) < Math.abs(plain.weights[0]));
  // Imbalanced labels with no feature signal: the intercept alone learns the base rate.
  const noSignal = [0, 0.7].flatMap((temperature) =>
    [2, 4, 6, 8].map((target, i) => ({ features: [target, temperature], label: i === 0 ? 1 : 0 })));
  const model = trainLogisticRegression(names, noSignal, { iterations: 5000, learningRate: 0.5, l2: 1 });
  assert.ok(Math.abs(sigmoid(model.intercept) - 0.25) < 0.01, `intercept ${model.intercept}`);
});

test('invalid options, labels, and feature values are rejected before training', () => {
  const examples = separable();
  for (const [override, message] of [
    [{ iterations: 0 }, /iterations/], [{ iterations: 1.5 }, /iterations/],
    [{ learningRate: 0 }, /learningRate/], [{ learningRate: Infinity }, /learningRate/],
    [{ l2: -1 }, /l2/], [{ l2: NaN }, /l2/],
  ]) {
    assert.throws(() => trainLogisticRegression(names, examples, { ...options, ...override }), message);
  }
  for (const [bad, message] of [
    [[], /nonempty array/],
    [[{ features: [2, 0], label: true }], /examples\[0\].label: expected 0 or 1/],
    [[{ features: [2], label: 0 }], /examples\[0\].features: expected 2 values/],
    [[{ features: [2, NaN], label: 0 }], /examples\[0\].features\[1\]: expected a finite number/],
  ]) {
    assert.throws(() => trainLogisticRegression(names, bad, options), message);
  }
  const model = trainLogisticRegression(names, examples, options);
  assert.throws(() => predictProbability(model, [2]), /values: expected 2 values \(target, temperature\)/);
  assert.throws(() => predictProbability(model, ['2', 0]), /values\[0\]: expected a finite number/);
});
