import { createArtifact } from './artifact-writer.mjs';
import { callModelAttempt, getModelDigest } from './provider.mjs';

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
  for (const target of targets) {
    for (const temperature of temperatures) {
      for (const maxTokens of maxTokensList) {
        for (const template of templates) {
          const prompt = workload.promptFor(template, target);
          const conditionResults = [];
          for (let i = 0; i < runsPerCondition; i++) {
            const seed = baseSeed + i;
            const condition = { target, temperature, maxTokens, template, prompt, seed, run: i + 1 };
            const { response, error, elapsedMs } = await callModelAttempt({
              baseUrl, model, timeoutMs, prompt, temperature, seed, maxTokens,
            });
            let row;
            if (response) {
              // Evaluation fields belong to the workload. Provider evidence and
              // condition identity remain runner-owned, even if names overlap.
              const evaluation = workload.evaluate(response, target);
              row = { ...evaluation, ...condition, ...response, elapsedMs };
            } else {
              row = {
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
            await onAttempt?.(row);
            conditionResults.push(row);
            allResults.push(row);
            // Evaluation, presentation, and writes stay outside provider error
            // recovery. Await each checkpoint before starting another call.
            await artifact.persist(buildReport(false));
          }
          matrix.push({
            target, temperature, maxTokens, template,
            ...workload.summarize(conditionResults, runsPerCondition),
          });
        }
      }
    }
  }

  await onMatrix?.(matrix);
  const report = buildReport(true);
  await artifact.persist(report);
  return { report, artifactPath: artifact.path, allPassed: report.failingConditions.length === 0 };
}
