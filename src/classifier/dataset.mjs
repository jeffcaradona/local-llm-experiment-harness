// Turn analysis records into the classifier's pre-run dataset. This module
// consumes the output of src/analysis/result-records.mjs; it never parses raw
// harness artifacts or imports execution code.

// Model inputs, in the order every weight vector and feature row uses. Only
// configuration known before the model call belongs here: outcomes and
// post-run telemetry (pass, failureReason, text, tokens, finishReason,
// elapsedMs, ...) would leak the label. Run and seed identify repeated attempts
// and are not hypothesized causes, so they are excluded too.
export const FEATURE_NAMES = Object.freeze(['target', 'temperature']);

// The retained sweep has 10 attempts per condition. Splitting on attempt number
// keeps every condition in both partitions without shuffling. This evaluates
// unseen attempts of known configurations, not unseen configurations.
export const SPLIT = Object.freeze({
  rule: 'runs 1-8 train; runs 9-10 evaluation',
  runsPerCondition: 10,
  lastTrainingRun: 8,
});

// FAIL is the positive class, so precision and recall describe how well the
// model finds risky configurations. The saved harness verdict is authoritative.
export function labelFor(record) {
  if (record.passed === false) return 1;
  if (record.passed === true) return 0;
  throw new Error(`record ${record.resultIndex}: expected a boolean recorded verdict`);
}

export function featuresFor(record) {
  return FEATURE_NAMES.map((name) => record[name]);
}

function conditionKey(record) {
  return `target=${record.target} temperature=${record.temperature}`;
}

// Fields the model does not use must not vary, or the model would silently pool
// different experiments. Every value here comes from one artifact and sweep.
function requireSingleValue(records, field) {
  const values = [...new Set(records.map((record) => record[field]))];
  if (values.length !== 1) {
    throw new Error(`${field}: expected one value across the dataset, found ${values.length}`);
  }
  return values[0];
}

export function buildDataset(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('records: expected a nonempty array of analysis records');
  }
  const source = requireSingleValue(records, 'source');
  if (records.some((record) => record.complete !== true)) {
    throw new Error(`${source}: expected a complete sweep, found an incomplete checkpoint`);
  }
  const heldConstant = {
    model: requireSingleValue(records, 'model'),
    maxTokens: requireSingleValue(records, 'maxTokens'),
    template: requireSingleValue(records, 'template'),
  };

  // Fail rather than invent a different split when the sweep does not have
  // exactly one attempt for each run number in every condition.
  const runsByCondition = new Map();
  for (const record of records) {
    const key = conditionKey(record);
    if (!runsByCondition.has(key)) runsByCondition.set(key, []);
    runsByCondition.get(key).push(record.run);
  }
  for (const [key, runs] of runsByCondition) {
    const sorted = [...runs].sort((a, b) => a - b);
    const expected = Array.from({ length: SPLIT.runsPerCondition }, (_, index) => index + 1);
    if (sorted.join(',') !== expected.join(',')) {
      throw new Error(`${key}: expected runs 1-${SPLIT.runsPerCondition} exactly once, found ${sorted.join(',')}`);
    }
  }

  // Record order is experiment order; both partitions preserve it.
  const training = [];
  const evaluation = [];
  for (const record of records) {
    const example = {
      resultIndex: record.resultIndex,
      run: record.run,
      features: featuresFor(record),
      label: labelFor(record),
    };
    (record.run <= SPLIT.lastTrainingRun ? training : evaluation).push(example);
  }

  const first = records[0];
  return {
    featureNames: [...FEATURE_NAMES],
    split: SPLIT.rule,
    source: {
      path: source,
      harness: first.harness,
      scriptHash: first.scriptHash,
      harnessHash: first.harnessHash,
      startedAt: first.startedAt,
      modelDigest: first.modelDigest,
      conditionCount: runsByCondition.size,
      ...heldConstant,
    },
    training,
    evaluation,
  };
}
