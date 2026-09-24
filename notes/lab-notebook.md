# Lab Notebook

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

