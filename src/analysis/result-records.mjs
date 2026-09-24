// This consumer understands the v2.5 artifact, without importing execution code.
// Validate only the fields used below; summaries and raw provider data may evolve.
function requireValue(condition, path, expected) {
  if (!condition) throw new Error(`${path}: expected ${expected}`);
}

function requireObject(value, path) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'an object');
}

function requireString(value, path) {
  requireValue(typeof value === 'string' && value.length > 0, path, 'a nonempty string');
}

function requireInteger(value, path, minimum) {
  requireValue(Number.isSafeInteger(value) && value >= minimum, path, `an integer >= ${minimum}`);
}

function optionalString(value, path) {
  if (value != null) requireValue(typeof value === 'string', path, 'a string or null');
  return value ?? null;
}

export function extractRecords(artifact, source) {
  requireString(source, 'source');
  requireObject(artifact, source);
  requireValue(artifact.harness === 'greeting-harness-v2.5', `${source}.harness`, 'greeting-harness-v2.5');
  // Only this known legacy format permits inferring a missing workload identity.
  if (artifact.workload !== undefined) {
    requireValue(artifact.workload === 'greeting', `${source}.workload`, 'greeting');
  }
  requireString(artifact.startedAt, `${source}.startedAt`);
  requireValue(Number.isFinite(Date.parse(artifact.startedAt)), `${source}.startedAt`, 'a timestamp');
  requireValue(typeof artifact.complete === 'boolean', `${source}.complete`, 'a boolean');
  requireObject(artifact.environment, `${source}.environment`);
  requireString(artifact.environment.model, `${source}.environment.model`);
  requireValue(Array.isArray(artifact.results), `${source}.results`, 'an array');
  const scriptHash = optionalString(artifact.scriptHash, `${source}.scriptHash`);
  const harnessHash = optionalString(artifact.harnessHash, `${source}.harnessHash`);
  const modelDigest = optionalString(artifact.environment.modelDigest, `${source}.environment.modelDigest`);

  return artifact.results.map((row, resultIndex) => {
    const path = `${source}.results[${resultIndex}]`;
    requireObject(row, path);
    requireInteger(row.target, `${path}.target`, 0);
    requireValue(Number.isFinite(row.temperature), `${path}.temperature`, 'a finite number');
    requireInteger(row.maxTokens, `${path}.maxTokens`, 1);
    requireInteger(row.run, `${path}.run`, 1);
    requireInteger(row.seed, `${path}.seed`, Number.MIN_SAFE_INTEGER);
    requireString(row.template, `${path}.template`);
    requireValue(typeof row.prompt === 'string', `${path}.prompt`, 'a string');
    requireValue(typeof row.pass === 'boolean', `${path}.pass`, 'a boolean');
    for (const field of ['promptTokens', 'completionTokens', 'reasoningTokens']) {
      if (row[field] != null) requireInteger(row[field], `${path}.${field}`, 0);
    }
    if (row.elapsedMs != null) {
      requireValue(Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0, `${path}.elapsedMs`, 'a finite number >= 0');
    }
    const finishReason = optionalString(row.finishReason, `${path}.finishReason`);
    const error = optionalString(row.error, `${path}.error`);
    // Legacy files lack a reason. New reasons must agree with the saved verdict
    // and error, without reevaluating text or interpreting a length stop as failure.
    const legacyReason = row.pass ? null : error !== null ? 'provider_error' : 'word_count_mismatch';
    if (row.failureReason !== undefined) {
      requireValue(row.failureReason === legacyReason, `${path}.failureReason`, JSON.stringify(legacyReason));
    }

    return {
      source,
      resultIndex,
      workload: 'greeting',
      harness: artifact.harness,
      scriptHash,
      harnessHash,
      startedAt: artifact.startedAt,
      complete: artifact.complete,
      model: artifact.environment.model,
      modelDigest,
      target: row.target,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      template: row.template,
      prompt: row.prompt,
      run: row.run,
      seed: row.seed,
      // Absent legacy telemetry stays unavailable; never derive it from text.
      promptTokens: row.promptTokens ?? null,
      completionTokens: row.completionTokens ?? null,
      reasoningTokens: row.reasoningTokens ?? null,
      elapsedMs: row.elapsedMs ?? null,
      passed: row.pass,
      failureReason: row.failureReason === undefined ? legacyReason : row.failureReason,
      error,
      finishReason,
    };
  });
}
