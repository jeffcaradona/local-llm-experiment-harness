// Binary logistic regression written out by hand so every step is 
// inspectable.
// Training is deterministic full-batch gradient descent: 
//  no shuffling, no random initialization, 
//  and a fixed iteration count. The returned model is plain data
//  that holds everything needed for inference.

function requireExamples(featureNames, examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    throw new Error('examples: expected a nonempty array');
  }
  for (const [index, example] of examples.entries()) {
    if (example.label !== 0 && example.label !== 1) {
      throw new Error(`examples[${index}].label: expected 0 or 1`);
    }
    requireFeatureValues(featureNames, example.features, `examples[${index}].features`);
  }
}

function requireFeatureValues(featureNames, values, path) {
  if (!Array.isArray(values) || values.length !== featureNames.length) {
    throw new Error(`${path}: expected ${featureNames.length} values (${featureNames.join(', ')})`);
  }
  for (const [index, value] of values.entries()) {
    if (!Number.isFinite(value)) throw new Error(`${path}[${index}]: expected a finite number`);
  }
}

// Mean and population standard deviation, computed from the rows passed in.
// Callers pass only training rows so evaluation data cannot shape the model.
// A constant feature has no information and would divide by zero, so reject it
// instead of silently dropping it or changing its meaning.
export function fitStandardization(featureNames, rows) {
  return featureNames.map((name, column) => {
    const values = rows.map((row) => row[column]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    if (!(standardDeviation > 0)) {
      throw new Error(`feature ${name}: zero variance in training data; cannot standardize`);
    }
    return { name, mean, standardDeviation };
  });
}

function standardize(features, values) {
  return values.map((value, column) => (value - features[column].mean) / features[column].standardDeviation);
}

// Split by sign so Math.exp only sees nonpositive arguments and cannot overflow.
export function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const exponential = Math.exp(z);
  return exponential / (1 + exponential);
}

function linearScore(weights, intercept, standardized) {
  return standardized.reduce((sum, value, column) => sum + weights[column] * value, intercept);
}

// options: { iterations, learningRate, l2 }. There are no hidden defaults; the
// caller chooses and records them. L2 penalizes weights but not the intercept.
export function trainLogisticRegression(featureNames, examples, options) {
  const { iterations, learningRate, l2 } = options;
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new Error('iterations: expected a positive integer');
  }
  if (!(Number.isFinite(learningRate) && learningRate > 0)) {
    throw new Error('learningRate: expected a positive finite number');
  }
  if (!(Number.isFinite(l2) && l2 >= 0)) throw new Error('l2: expected a finite number >= 0');
  requireExamples(featureNames, examples);

  const features = fitStandardization(featureNames, examples.map((example) => example.features));
  const rows = examples.map((example) => standardize(features, example.features));
  const labels = examples.map((example) => example.label);
  const count = rows.length;
  let intercept = 0;
  let weights = featureNames.map(() => 0);

  for (let iteration = 0; iteration < iterations; iteration++) {
    // Gradient of mean binary cross-entropy: average of (p - y) * x.
    let interceptGradient = 0;
    const weightGradients = weights.map(() => 0);
    for (let index = 0; index < count; index++) {
      const error = sigmoid(linearScore(weights, intercept, rows[index])) - labels[index];
      interceptGradient += error;
      for (let column = 0; column < weights.length; column++) {
        weightGradients[column] += error * rows[index][column];
      }
    }
    intercept -= learningRate * (interceptGradient / count);
    weights = weights.map((weight, column) =>
      weight - learningRate * (weightGradients[column] / count + l2 * weight));
  }

  return { features, intercept, weights };
}

// Probability of the positive class (FAIL) for raw, unstandardized values in
// model.features order. This is a model estimate, not a certainty.
export function predictProbability(model, values) {
  const featureNames = model.features.map((feature) => feature.name);
  requireFeatureValues(featureNames, values, 'values');
  return sigmoid(linearScore(model.weights, model.intercept, standardize(model.features, values)));
}
