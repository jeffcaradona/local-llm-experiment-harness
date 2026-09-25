# Lab Notebook

## 2026-09-25 — Milestone two, checkpoint 1

Begin the first classifier consumer of retained experiment evidence. This
checkpoint adds the pure core only: the dataset contract and a hand-written
logistic regression. It adds no CLI, no model artifact, no metrics, and no
recorded model result.

- Question: can pre-run experiment configuration predict harness failure?
- Model: binary logistic regression, deterministic full-batch gradient descent.
- Positive class: FAIL (`passed === false` → 1, `passed === true` → 0). The
  saved verdict is authoritative; no text is evaluated again.
- Features, in fixed order: `target`, `temperature`.
- Split: runs 1-8 train, runs 9-10 evaluate.

Classifier code consumes records from `src/analysis/result-records.mjs` and
imports no harness, workload, or entry-script code; a test checks this. Outcome
and post-run fields, `run`, `seed`, `maxTokens`, and template identity are not
features. Instead, the dataset requires a single source, model, `maxTokens`, and
template, so unmodeled differences cannot be silently pooled. It also requires a
complete sweep with runs 1-10 exactly once per condition. Otherwise it fails
rather than inventing a different split. The seven-template default run
(`2026-09-24T01-20-38-508Z.json`) is therefore rejected.

Standardization is fitted on the training rows passed to training, using the
population standard deviation. A zero-variance feature is an error. Training
has no randomness and no hidden defaults: the caller supplies iterations,
learning rate, and L2, which penalizes weights but not the intercept.

Observed dataset shape for the historical fixed-prompt baseline
(`2026-09-24T00-46-57-104Z.json`): 20 conditions, 160 training records with 9
FAIL, and 40 evaluation records with 2 FAIL. The training failures are
target 10/temperature 0 runs 1-8 plus target 11/temperature 0.7 run 1. Both
held-out failures are target 10/temperature 0 (runs 9 and 10). The held-out
partition is therefore very small and PASS-dominant. It measures unseen
attempts of known configurations, not unseen targets, models, or prompts.

Validation: all 48 deterministic tests and ESLint passed on Linux with Node.js
v24.13.0. New tests cover the feature and label contract, the split and its
rejection cases, training-only standardization, a separable synthetic dataset,
repeatable parameters, and the import boundary. No model or provider calls were
made, and no harness code, prompts, or artifacts changed. ESLint now declares
the `structuredClone` global used by tests.

Next checkpoints: (2) evaluation metrics with the majority baseline and a
versioned JSON model artifact that refuses to overwrite; (3) train and predict
CLIs, training on one retained sweep, and recording observed metrics and
interpretation; (4) milestone acceptance.

## 2026-09-24 — Milestone one, checkpoint 6

Complete the milestone-one requirements audit and acceptance validation. The
greeting workload, reusable runner, preserved evidence, and independent analysis
consumer satisfy the milestone without additional runtime changes. The
[acceptance record](milestone-one-acceptance.md) maps each requirement to its
implementation and records the five separately committed acceptance steps.

Observed validation: all 36 deterministic tests and ESLint passed on Windows
with Node.js v26.1.0 and npm 11.13.0. This includes the mock-provider CLI-to-artifact-
to-analysis smoke test. No new tests were needed and no model calls were made.
Node.js 24 and Linux were not rerun during acceptance.

Derived verification: the independent analysis CLI read the historical
fixed-prompt baseline and checkpoint-4 artifact together, producing 400 records
in input/attempt order with identical output on repeat execution. Saved verdicts,
failure reasons (derived for legacy rows), and available telemetry were preserved.
Each artifact contributes 189 passes and 11 failures; unavailable telemetry
remains null. Input bytes were unchanged. The
[verification summary](../results/analysis/checkpoint6-retained-artifact-verification.json)
records hashes, counts, and assertion outcomes; it is not a new experiment.

Interpretation: milestone one now provides the intended reusable execution seam
and stable downstream analysis path. The target-10 observation is unchanged;
its cause remains unestablished. Real-provider validation applies to checkpoint
4, while checkpoint 5's extraction is supported by deterministic compatibility
checks. This acceptance does not claim a fresh real-provider reproduction.

Behavioral changes in checkpoint 6: none. Structural changes: acceptance
documentation, a retained derived verification summary, and README completion
status and PowerShell reproduction commands. Prompts, execution sources,
dependencies, and historical artifacts are unchanged. A second production
workload, broader analysis support, crash-atomic writes, recovery/resume, ML,
storage, and agent integrations remain deferred.

## 2026-09-24 — Milestone one, checkpoint 5

Move the remaining sweep, report assembly, and checkpoint lifecycle into
`src/harness/runner.mjs`. The greeting entry file now supplies explicit
configuration, workload, source identity, and presentation callbacks, and maps
the returned outcome to the existing exit statuses. The runner can be imported
without executing an experiment and called again without sharing result state.
Source hashes now include the runner.

This is a structural extraction. Prompts, defaults, provider requests, condition
ordering, per-condition seed reset, word-count verdicts, summary calculations,
thresholds, and checkpoint sequencing retain their behavior. Artifact fields
retain their meanings, although result object key ordering changes. Provider
failures still count as failed attempts; evaluation and write errors remain
fatal. Historical evidence files are unchanged.

Validation: all 36 deterministic tests and ESLint passed. The existing mock CLI
compatibility tests and CLI-to-artifact-to-analysis smoke test passed. New tests
exercise exact-text evaluation in a test-only workload, awaited callbacks and
checkpoints, repeated invocations, and a checkpoint-write failure that stops
further calls. Source identity tests also verify that a runner edit changes the
harness hash while preserving the entry script hash.

No real model calls were made for this checkpoint. These checks establish
execution compatibility for the tested cases, not new evidence about the
target-10 observation. The earlier real-provider validation applies to
checkpoint 4.

A second production workload and its analysis support remain future work.
The runner retains the existing sweep dimensions and provider protocol;
generic workload registration, crash-atomic writes, recovery, resume, ML,
storage, and agent integrations remain deferred. Stop here for the manual
commit checkpoint after testing and documentation.

## 2026-09-24 — Checkpoint 4 real-provider validation

Run the historical fixed-prompt sweep against the real Ollama endpoint after
checkpoint 4. The commands under `local/` are scratch/provenance files: their
relative CLI and output paths assume the repository root as the working
directory. Execute only the selected sweep block, not the whole command file,
which also contains a separate default run.

Explicit configuration used from the repository root:

```powershell
$env:BASE_URL = 'https://ollama.redshift.irrational.cc/v1'
$env:MODEL = 'nemotron-3-nano:4b'
$env:TARGETS = '2,4,6,7,8,9,10,11,12,13'
$env:TEMPERATURES = '0,0.7'
$env:MAX_TOKENS_LIST = '3200'
$env:PROMPT_TEMPLATES_FILE = 'NUL'
$env:BASE_SEED = '1'
$env:THRESHOLD = '0.8'
$env:TIMEOUT_MS = '180000'
$env:OUT_DIR = './results'
node greeting-harness-v2.5.mjs 10
```

On this Windows run, reading `NUL` returned `ENOENT`, activating the existing
single-template fallback. The saved template is exactly
`Write a greeting with a {target}-word count`. The initial sandboxed connection
was denied before any generation calls; the authorized network retry completed
the sweep once.

Evidence:

- [Historical fixed-prompt baseline](../results/2026-09-24T00-46-57-104Z.json).
- [New checkpoint 4 artifact](../results/2026-09-24T23-36-45-241Z.json).
- [Derived comparison](../results/analysis/2026-09-24T23-36-45-241Z-checkpoint4-comparison.json),
  containing input SHA-256 hashes, configuration checks, outcome counts, telemetry
  availability, and condition comparisons. This is a comparison summary, not a
  harness artifact accepted by the analysis CLI.

Observed: the run completed 200 attempts across 20 conditions in about 13 minutes
57 seconds. There were 189 passes, 11 truncated failures, and no provider errors.
The CLI exited with status `1` because one condition was below the 0.8 threshold;
the artifact has `complete: true`. This was not an execution failure.

| Condition | Baseline passes | New passes |
| --- | --- | --- |
| Target 10, temperature 0 | 0/10 | 0/10 |
| Target 10, temperature 0.7 | 10/10 | 10/10 |
| Target 9, temperature 0 | 10/10 | 10/10 |
| Target 11, temperature 0 | 10/10 | 10/10 |
| Target 11, temperature 0.7 | 9/10 | 9/10 |
| Every other condition | 10/10 | 10/10 |

Derived checks: all parameters, the model digest, request bodies, attempt order,
and every legacy result-row field match the baseline. This includes generated
text, reasoning text, word counts, completion-token counts, finish reasons, and
verdicts for all 200 attempts, at both temperatures. The full condition matrix
and failing-condition list also match. New source hashes match the execution
files, and both retained baseline artifacts remain unchanged.

New evidence fields work with the real provider: all 200 rows contain prompt
tokens, completion tokens, and finite nonnegative elapsed milliseconds. All
reasoning-token counts remain null because the provider did not supply the
supported field. No reasoning token counts were inferred from text. The ten
target-10 greedy failures each consumed 3,200 completion tokens, produced no
output words, and retained `word_count_mismatch` with a `length` stop.

The standalone analysis CLI successfully validated the baseline and new artifact
together, emitted 400 records in input order, and exited with status `0`:

```sh
node src/analysis/analyze-results.mjs results/2026-09-24T00-46-57-104Z.json results/2026-09-24T23-36-45-241Z.json
```

It also successfully consumed an incomplete checkpoint during the live run,
preserving `complete: false`. Historical unavailable telemetry remains null.

Interpretation: this run supports preservation of the original experiment's
behavior through checkpoint 4 and reproduces the target-10 observation. It does
not establish its cause or guarantee identical outcomes under other serving
conditions. The model digest and endpoint match, but the baseline client was
Linux/Node v24.13.0 and this client was Windows/Node v26.1.0; server runtime
identity is not recorded. No harness changes were needed for this check.

## 2026-09-24 — Milestone one, checkpoint 4

Preserve more evidence from each generation without changing the prompts,
requests, sweep order, seeds, thresholds, or greeting pass/fail rule. New rows
retain the provider's usage value and explicit prompt/reasoning token fields
when supplied. Missing telemetry remains null; zero remains zero. Reasoning
word counts remain distinct from provider token counts.

Attempts now record client-observed elapsed milliseconds around the provider
call, including response reading and normalization on successful and failed
calls. This excludes evaluation and persistence and is not a measurement of
model inference time. Stored failure reasons classify outcomes only: a pass has
no failure reason, a greeting mismatch is `word_count_mismatch`, and a failed
provider call is `provider_error`. Evaluation and persistence failures are fatal
rather than provider-error rows. A length stop still does not veto a word-count
match. This narrows the old catch boundary for internal evaluation errors.

The independent analysis consumer accepts the additive fields and validates
their types and reason/verdict consistency. Historical artifacts keep their
existing interpretation, including derived reasons and null unavailable timing
and token fields. No retained experiment artifacts were modified.

A small artifact writer exclusively creates an initial incomplete report and
uses numeric filename suffixes on collisions, including concurrent creation.
Each invocation checkpoints its own file after every attempt and at completion.
An empty incomplete report can now remain if evaluation fails on the first call.
Writes are not crash-atomic and do not provide recovery or resume.

Validation: all 33 deterministic tests and ESLint passed. Tests include controlled
clock timing, explicit/absent/zero usage, malformed analysis fields, historical
compatibility, concurrent filename collisions, checkpoint sequencing, and fatal
evaluation errors. The mock-provider CLI-to-artifact-to-analysis integration is
the smoke test. No real model calls were made, so this adds no model evidence
and does not revalidate or explain the target-10 observation.

Next: extract the reusable execution loop in checkpoint 5. Crash-atomic writes,
recovery, and resumable execution remain deferred, along with the milestone's
excluded ML, storage, and agent integrations.

## 2026-09-24 — Milestone one, checkpoint 3

Add an independent consumer of saved greeting v2.5 artifacts. It validates the
fields it consumes and emits one stable analysis record per recorded attempt,
retaining source path, row index, experiment identity, condition, and verdict.
Both retained historical artifacts and newer workload-tagged files are supported.
No execution code or original prompts change in this checkpoint.

Analysis preserves recorded pass/fail, including passes with a length stop.
Failure reasons are derived from the saved error field and v2.5 word-count rule;
they are not new provider observations or explanations for the target-10 effect.
Unavailable prompt/reasoning tokens and per-attempt elapsed time remain null.
Incomplete checkpoints retain their incomplete status and only their saved rows.

Deterministic tests cover malformed inputs, provenance, attempt ordering,
unavailable telemetry, legacy artifacts, and standalone CLI behavior. These
checks consume existing evidence and synthetic fixtures; no new model evidence
is collected. The target-10 observation and its interpretation remain unchanged.

Still deferred: reusable execution loop, additional provider telemetry and
elapsed time, and collision-safe artifact creation. The next execution-side
checkpoint should preserve richer evidence without changing experiment semantics.

## 2026-09-24 — Milestone one, checkpoint 2

Extract greeting template loading, rendering, evaluation, and condition summaries
into one explicit workload. Extract provider discovery and generation calls into
a harness module. The CLI continues to own configuration, ordering, checkpoint
writes, thresholds, and console reporting. Original prompt files are unchanged.

New artifacts identify the greeting workload and hash all execution source files.
The historical `scriptHash` field keeps its entry-file meaning; `sourceHashes`
and `harnessHash` identify the extracted implementation. These are additive
metadata fields, with no changes to row pass/fail or condition summaries.

Compatibility tests and focused module tests use synthetic provider responses.
They establish preservation of the tested behavior, not reproduction of the
target-10 model observation. The existing CLI tests also needed a Windows file
URL fix for Node's preload argument. No real model calls were made.

Still deferred: reusable execution loop, additional provider telemetry and
elapsed time, collision-safe artifact creation, and independent result analysis.
The immediate research question and interpretation from checkpoint 1 remain
unchanged; this checkpoint adds no new model evidence.

## 2026-09-24 — Milestone one, checkpoint 1

Begin the migration from greeting-harness v2.5 to a reusable experiment harness
by capturing its existing behavior in deterministic CLI compatibility tests.
This checkpoint changes no experiment code or prompt wording. Mock responses
verify execution and artifacts; they do not reproduce model behavior.

The prior observation recorded in the milestone prompt is an isolated failure
at `target=10`, `temperature=0` with a 3200-token budget, while neighboring
targets 9 and 11 passed; target 10 recovered at temperature 0.7. An isolated or
jagged greedy-decoding failure is the current interpretation, not an established
cause. This checkpoint does not independently revalidate that observation.

The immediate next question is how to preserve stable experiment artifacts for
downstream statistical or classification analysis while separating the greeting
workload from execution. Workload extraction, additional available telemetry,
and independent analysis remain for later manual commit checkpoints. No machine
learning is planned for this milestone.


## 2026-09-23

### Pre-Refactoring Milestone Prompt Baseline Results:
- greeting-harness-v2.5.mjs
  - results/2026-09-24T00-46-57-104Z.json 
    the known sweep:

    - targets 2,4,6,7,8,9,10,11,12,13
    - temperatures 0,.7
    - MAX_TOKENS_LIST=3200
    - PROMPT_TEMPLATES_FILE=/dev/null
    
  - results/2026-09-24T01-09-21-177Z.json
    default run:
    
    - targets 10
    
---

