# Milestone one acceptance

Checkpoint 6 closes the requirements in
[the milestone prompt](../.github/prompts/first-milestone.prompt.md).
The audit starts from commit `b706ce0` (checkpoint 5 plus the c8 development
dependency). Each of the five acceptance steps has its own commit.

## 1. Requirements audit — complete

Source inspection on 2026-09-24 found no implementation gaps requiring changes.
This is a requirements assessment; fresh validation is recorded separately below.

| Requirement | Implementation and existing verification |
| --- | --- |
| Preserve v2.5 behavior and prompts | The greeting CLI retains environment defaults and exit statuses. `greeting-compatibility.test.mjs` checks original prompt wording, requests, ordering, seeds, fallback, thresholds, and verdicts. |
| Make greeting a workload | `workloads/greeting/workload.mjs` supplies a plain workload object to `src/harness/runner.mjs`. Runner tests exercise a different test-only task without cloning execution. |
| Preserve experiment parameters | The CLI maps all existing environment variables into explicit configuration. The runner sweeps target, temperature, token budget, template, then run, resetting seeds per condition. |
| Preserve machine-readable evidence | Reports retain timestamps, source identity, model/digest, configuration, prompts, responses, verdicts, reasons, timing, usage, and finish reasons. Unavailable telemetry stays null. Exclusive artifact creation protects existing files from filename collisions. |
| Independent downstream analysis | `src/analysis/analyze-results.mjs` reads explicit artifact paths; `result-records.mjs` validates and extracts records without importing execution code. File and attempt order are preserved. |
| npm command surface | `experiment:greeting`, `analyze`, and `test` exist, with `lint` for static checks. No training or prediction commands are introduced. |
| Human interpretation | `notes/lab-notebook.md` records migration, the target-10 observation, the next research question, and the limits of each validation step. |

Behavior to preserve: prompt text, CLI defaults, request parameters, sweep order,
seed reset, whitespace word-count evaluation (including passes stopped by
`length`), condition summaries, thresholds, and exit statuses. Historical
artifacts must remain unchanged. Reasoning word counts must never become inferred
token counts.

The existing structure satisfies the milestone boundary: execution produces
artifacts, and analysis independently consumes them. No runtime dependency on
analysis, classifiers, or agent tooling was found. A second production workload
is unnecessary for acceptance; the test-only workload demonstrates the seam.

## 2. Deterministic validation — complete

Validated commit `dbfd721` on 2026-09-24 using Windows, Node.js v26.1.0, and
npm 11.13.0:

| Command | Result |
| --- | --- |
| `npm test` | Exit 0; 36 passed, 0 failed, 0 skipped. |
| `npm run lint` | Exit 0; no lint findings. |

The passing suite includes the mock-provider CLI-to-artifact-to-analysis smoke
test: four saved attempts preserve the pass, word-count mismatch, provider error,
and missing-telemetry outcomes through independent analysis. Compatibility tests
also cover the default 140-attempt mock sweep, prompt wording, ordering, seed
reset, template fallback, thresholds, and fatal errors. Runner tests exercise a
second test-only workload, isolated invocations, awaited callbacks/checkpoints,
and fatal persistence failures.

No defects were found and no tests or execution code were changed. These checks
made no network or model calls. Node.js 24 and Linux were not rerun during this
acceptance; the validation environment above is the one actually tested.

## 3. Retained-artifact analysis — pending

Analyze the historical fixed-prompt baseline and checkpoint-4 artifact together.
Verify record order, saved verdicts, null unavailable telemetry, and unchanged
input bytes. Retain a compact machine-generated verification summary under
`results/analysis/`.

## 4. Documentation — pending

Mark the milestone complete after validation, document PowerShell reproduction
commands, and add a notebook entry separating compatibility checks from real
model evidence.

## 5. Final review and commit — pending

Review the complete diff and repository state, record the acceptance outcome,
and commit the final review. The user requested commits for all five steps.

## Validation limits and deferred work

Checkpoint 4 has real-provider evidence; checkpoint 5 has deterministic
compatibility evidence. This acceptance work does not schedule another model
sweep and cannot establish the cause of the target-10 behavior.

The analysis reader explicitly supports greeting artifacts. Another production
workload needs its own analysis support and execution-source identity. Crash-atomic
writes, recovery, resume, generic workload registration, ML/classifiers/training,
model serialization, SQL Server, R/Python workflows, ONNX, MCP/agent integration,
TypeScript migration, and application frameworks remain deferred.
