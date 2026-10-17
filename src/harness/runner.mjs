import { createArtifact } from './artifact-writer.mjs';
import { callModelAttempt, getModelDigest } from './provider.mjs';

function* experimentConditions({ targets, temperatures, maxTokensList }, templates) {
  for (const target of targets) {
    for (const temperature of temperatures) {
      for (const maxTokens of maxTokensList) {
        for (const template of templates) {
          yield { target, temperature, maxTokens, template };
        }
      }
    }
  }
}

async function executeAttempt({ baseUrl, model, timeoutMs, condition, workload }) {
  const { target, temperature, maxTokens, prompt, seed } = condition;
  const { response, error, elapsedMs } = await callModelAttempt({
    baseUrl, model, timeoutMs, prompt, temperature, seed, maxTokens,
  });
  if (response) {
    const evaluation = workload.evaluate(response, target);
    return { ...evaluation, ...condition, ...response, elapsedMs };
  }
  return {
    ...condition,
    error,
    pass: false,
    failureReason: 'provider_error',
    elapsedMs,
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    usage: null,
    truncated: false,
  };
}

// A workload supplies template loading, rendering, evaluation, and summaries.
// Keep CLI configuration, source identity, and presentation with the caller.
export async function runExperiment({ config, workload, identity, onTemplates, onAttempt, onMatrix }) {
  const {
    harness, baseUrl, model, outDir, runsPerCondition, targets, temperatures,
    maxTokensList, promptTemplatesFile, baseSeed, threshold, timeoutMs,
  } = config;
  const startedAt = new Date().toISOString();
  const modelDigest = await getModelDigest({ baseUrl, model });
  const { templates, source: templatesSource } = await workload.loadTemplates(promptTemplatesFile);
  await onTemplates?.(templates);

  // State belongs to this invocation; importing or calling the runner again
  // must not carry attempts or conditions over from another experiment.
  const allResults = [];
  const matrix = [];
  const buildReport = (finished) => ({
    harness,
    ...identity,
    workload: workload.id,
    startedAt,
    finishedAt: finished ? new Date().toISOString() : null,
    complete: finished,
    environment: { nodeVersion: process.version, platform: process.platform, baseUrl, model, modelDigest },
    params: {
      runsPerCondition,
      targets,
      temperatures,
      maxTokensList,
      promptTemplatesFile: templatesSource,
      promptTemplates: templates,
      baseSeed,
      threshold,
      timeoutMs,
    },
    matrix,
    failingConditions: matrix.filter((m) => m.passRate < threshold),
    results: allResults,
  });
  const artifact = await createArtifact(outDir, startedAt, buildReport(false));

  // Preserve v2.5's dimension order and reset the seed for every condition.
  for (const dimensions of experimentConditions(config, templates)) {
    const prompt = workload.promptFor(dimensions.template, dimensions.target);
    const conditionResults = [];
    for (let runIndex = 0; runIndex < runsPerCondition; runIndex++) {
      const condition = { ...dimensions, prompt, seed: baseSeed + runIndex, run: runIndex + 1 };
      const row = await executeAttempt({ baseUrl, model, timeoutMs, condition, workload });
      await onAttempt?.(row);
      conditionResults.push(row);
      allResults.push(row);
      await artifact.persist(buildReport(false));
    }
    matrix.push({
      ...dimensions,
      ...workload.summarize(conditionResults, runsPerCondition),
    });
  }

  await onMatrix?.(matrix);
  const report = buildReport(true);
  await artifact.persist(report);
  return { report, artifactPath: artifact.path, allPassed: report.failingConditions.length === 0 };
}
