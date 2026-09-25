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

## 3. Retained-artifact analysis — complete

Ran the independent CLI twice against commit `796e4f0`:

```sh
node src/analysis/analyze-results.mjs results/2026-09-24T00-46-57-104Z.json results/2026-09-24T23-36-45-241Z.json
```

Both calls exited 0 with empty stderr and identical stdout. Assertions compared
all 400 emitted records with their saved attempts: input path, row index,
condition fields, completion status, verdict, failure reason, finish reason, and
normalized telemetry. Legacy reasons were checked against the documented
fallback. Both inputs were compared byte-for-byte before and after analysis.

| Input | Records | Passed / failed | Unavailable telemetry |
| --- | --- | --- | --- |
| Historical fixed-prompt baseline | 200 | 189 / 11 | Prompt tokens, reasoning tokens, and elapsed time are null in every record. |
| Checkpoint-4 real-provider artifact | 200 | 189 / 11 | Reasoning tokens are null in every record; prompt tokens and elapsed time are present. |

The [machine-generated verification summary](../results/analysis/checkpoint6-retained-artifact-verification.json)
retains input hashes before/after, analysis-source hashes, execution identity,
output hash, counts, and assertion outcomes. Its UTC timestamp may fall on the
following date relative to this notebook's America/Chicago date. This derived
summary is not a harness artifact and is not an input to `npm run analyze`.
No historical evidence was rewritten and no new model evidence was collected.

## 4. Documentation — complete

The README now marks milestone-one acceptance complete, links this record,
shows the final repository structure, and supplies explicit Linux and Windows
PowerShell configurations for the historical 200-attempt sweep. It explains
template fallback, persistent PowerShell environment settings, and exit status
1 for below-threshold completed experiments. These commands are documentation;
no real sweep was run during this checkpoint.

The checkpoint-6 notebook entry separates deterministic validation, derived
analysis verification, and interpretation. README and notebook both distinguish
checkpoint-4 real-provider evidence from checkpoint-5 runner compatibility.

## 5. Final review and commit — complete

Milestone one is accepted. Review against starting commit `b706ce0` confirms
that checkpoint 6 changes only the README, lab notebook, this acceptance record,
and the new derived verification summary. Execution code, prompts, test code,
package files, and historical artifacts are unchanged. No behavioral change or
runtime refactoring was needed for acceptance.

`git diff --check` passed. All added relative documentation links resolve, both
PowerShell command blocks parse successfully, and the retained JSON summary
contains only passing verification assertions. The working tree was clean after
step 4; this final record is the only change for step 5. Tests were not repeated
after documentation-only changes because the tested implementation is unchanged.

| Step | Commit |
| --- | --- |
| 1. Requirements audit | `dbfd721` |
| 2. Deterministic validation | `796e4f0` |
| 3. Retained-artifact verification | `59984e3` |
| 4. README and notebook completion | `deca7db` |
| 5. Final acceptance | The commit introducing this completed section. |

The final structure is documented in the README. No required milestone work
remains; the limits and deferred capabilities below remain explicit.

## Validation limits and deferred work

Checkpoint 4 has real-provider evidence; checkpoint 5 has deterministic
compatibility evidence. This acceptance work does not schedule another model
sweep and cannot establish the cause of the target-10 behavior.

The analysis reader explicitly supports greeting artifacts. Another production
workload needs its own analysis support and execution-source identity. Crash-atomic
writes, recovery, resume, generic workload registration, ML/classifiers/training,
model serialization, SQL Server, R/Python workflows, ONNX, MCP/agent integration,
TypeScript migration, and application frameworks remain deferred.
