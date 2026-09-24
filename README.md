# local-llm-experiment-harness

A Node.js harness for reproducible local LLM experiments. The greeting v2.5
experiment is the first workload. Milestone one is being implemented in small,
tested increments, with a manual commit checkpoint after each increment.

Use Node.js 24 or newer and npm 11. Install development dependencies with
`npm ci`.

```sh
npm test
npm run lint
```

Linting uses ESLint 10's recommended JavaScript rules with Node.js ESM globals.
The flat configuration in `eslint.config.mjs` excludes generated artifacts and
local scratch directories.

The compatibility tests launch the existing CLI with a mock provider. They make
no network or model calls, write results into temporary directories, and clean
up afterward. They protect the original prompts, defaults, sweep order, seed
reset, request parameters, template fallback, pass/fail semantics, and exit
statuses. The tests also serve as a CLI smoke test.

Focused module tests cover greeting evaluation and summaries, provider discovery
and response normalization, attempt timing, artifact filename collisions, and
source identity across extracted modules. Analysis tests cover both historical
and enriched artifacts, including malformed telemetry and failure reasons.
The preload uses a file URL so CLI tests also work with Windows drive paths.

To run a real experiment against your local provider:

```sh
BASE_URL=http://localhost:11434/v1 npm run experiment:greeting -- 1
```

The argument is runs per condition (default: 10). Defaults are model
`nemotron-3-nano:4b`, targets `10,8`, temperature `0`, and maximum tokens `3200`.
The seven templates in `./prompt-templates.txt` are swept by default, so the
example makes 14 generation calls. The provider must support the existing
`/api/tags` discovery call and `/v1/chat/completions` request.

The historical fixed-prompt sweep can be invoked on Linux with:

```sh
TARGETS=2,4,6,7,8,9,10,11,12,13 TEMPERATURES=0,0.7 MAX_TOKENS_LIST=3200 PROMPT_TEMPLATES_FILE=/dev/null npm run experiment:greeting -- 10
```

An empty or missing template file selects the original single template. Other
supported environment variables are `MODEL`, `OUT_DIR`, `BASE_SEED`, `THRESHOLD`,
and `TIMEOUT_MS`; defaults are documented in `greeting-harness-v2.5.mjs`.

Each invocation creates an initial incomplete JSON artifact under `results/`
before the first generation, checkpoints after every attempt, and marks the
artifact complete after the sweep. A response passes when its whitespace-delimited
word count equals the target, even if its finish reason is `length`. The CLI exits with `0` when
every condition meets the pass-rate threshold, `1` when any condition falls
below it, and `2` on a fatal error. A per-generation provider-call error counts as
a failed attempt and the sweep continues. Evaluation and artifact-writing errors
are fatal; they are not recorded as provider failures.

Checkpoint 2 adds `workload: "greeting"`, `sourceHashes`, and `harnessHash` to
new artifacts. `scriptHash` remains the first 16 hexadecimal characters of the
entry script's SHA-256 hash. Each `sourceHashes` entry uses the same algorithm
on the named file's bytes; `harnessHash` hashes the JSON serialization of that
ordered map. This identifies changes to extracted code as well as the CLI.
The explicit source list in `src/harness/source-hash.mjs` must include any
future execution modules. Prompt text remains recorded in the existing fields.
Historical artifacts are unchanged; their script-only identity still applies.

The extraction preserves experiment behavior, including the current-directory
default `./prompt-templates.txt`, template fallback, whitespace word counting,
and reasoning word counts. Reasoning word counts are not token telemetry.

Current structure:

```text
greeting-harness-v2.5.mjs       CLI, configuration, sweep, and report assembly
prompt-templates.txt           Active v2.5 prompt file
workloads/greeting/workload.mjs Template loading, rendering, evaluation, summary
workloads/greeting/prompts/    Unchanged prompt copy
workloads/greeting/expectations/ Reserved for expectation fixtures
src/harness/provider.mjs       Provider calls, usage normalization, attempt timing
src/harness/artifact-writer.mjs Exclusive artifact creation and checkpoint writes
src/harness/source-hash.mjs    Identity for all execution source files
src/analysis/result-records.mjs Artifact validation and pure record extraction
src/analysis/analyze-results.mjs Independent analysis CLI
src/classifier/               Deferred placeholder
tests/                        CLI and module tests, plus mock provider
results/                      Experiment evidence
notes/lab-notebook.md          Human interpretation and migration notes
models/                       Deferred placeholder
```

Checkpoint 3 adds independent analysis of existing artifacts. Checkpoint 4 adds
provider usage evidence, per-attempt timing, explicit failure reasons, and
protection against artifact filename collisions. The experiment CLI still owns
the sweep and greeting-specific console output; extracting a reusable runner is
planned for checkpoint 5. Machine learning and agent integrations are outside
milestone one.

## Checkpoint 4 evidence and artifact safety

New fields are additive: the harness remains `greeting-harness-v2.5`, and source
hashes identify the changed implementation. Prompts, request parameters, sweep
order, seeds, thresholds, word-count evaluation, and condition summaries retain
their existing behavior. Historical artifacts are not rewritten.

Each newly saved attempt includes the following fields:

| Field | Meaning |
| --- | --- |
| `promptTokens` | Provider `usage.prompt_tokens`, or `null` when unavailable. |
| `completionTokens` | Existing provider `usage.completion_tokens`, or `null`. |
| `reasoningTokens` | Provider `usage.completion_tokens_details.reasoning_tokens`, or `null`. |
| `usage` | The returned provider usage value, without discarding additional details; `null` when unavailable. |
| `elapsedMs` | Client-observed duration of the provider call in milliseconds, including failed calls. |
| `failureReason` | `null` for a pass, `word_count_mismatch` for a greeting evaluation failure, or `provider_error` for a failed provider call. |

Token normalization uses only those explicit paths, preserves zero, and performs
no numeric coercion. Other provider-specific fields remain in `usage` without
being mapped to normalized counts. The analysis consumer rejects malformed
normalized counts. It does not derive prompt tokens from totals or reasoning
tokens from the existing `reasoningLength` word count. Provider errors have null
usage and token fields because no normalized response was returned.

Timing uses a monotonic clock around the generation call, including request
construction, communication, response reading, and normalization. It excludes
model discovery, workload evaluation, console reporting, and artifact writes.
This measures client-observed latency, not model inference time. Fractional
milliseconds and zero are valid; tests use a controlled clock rather than
asserting real-time durations.

Failure reasons classify outcomes, not the cause of a model's behavior. A
word-count match with a `length` stop still has `pass: true` and
`failureReason: null`. HTTP, network, timeout, response-reading, and normalization
errors within the provider call become failed attempts. Evaluation and
persistence errors exit with status `2`; narrowing this boundary prevents them
from being mislabeled as provider errors.

Artifact creation uses an exclusive write. The normal filename remains
`<timestamp>.json`; if that path already exists, creation tries
`<timestamp>-1.json`, then `-2.json`, and so on. Concurrent invocations therefore
claim different files, preserving existing evidence. Subsequent awaited writes
update only the path claimed by that invocation.

Checkpoint replacement is not crash-atomic. An interrupted write can leave a
partial file; this change does not add recovery, resume, or protection against
external modification of an active artifact. Those capabilities remain deferred.

A [real-provider validation](notes/lab-notebook.md#2026-09-24--checkpoint-4-real-provider-validation)
completed the historical 200-attempt sweep after checkpoint 4. All legacy row
fields and condition summaries matched the retained baseline, with 189 passes
and 11 truncated failures. New timing and available token fields were recorded,
and the independent analysis CLI validated both artifacts. The notebook records
the commands, artifact links, environment differences, and interpretation limits.

## Analyze saved results

Pass one or more explicit JSON paths; no provider or running harness is needed:

```sh
npm run analyze -- results/2026-09-24T00-46-57-104Z.json results/2026-09-24T01-20-38-508Z.json
```

The command prints a JSON array with one record per saved attempt, preserving
file argument order followed by each file's result order. Repeated paths produce
repeated records. Inputs are never modified. There is no implicit directory scan
or sorting that could change sweep order.

For machine-readable stdout without npm's script banner, use:

```sh
node src/analysis/analyze-results.mjs results/2026-09-24T00-46-57-104Z.json
```

The reader supports `greeting-harness-v2.5` artifacts, both historical files and
files with the extracted workload identity. A missing `workload` is interpreted
as `greeting` only for that known harness. Other harnesses or conflicting workload
identities are rejected until their formats have explicit support.

Each record includes:

- Provenance: `source` (the supplied path), zero-based `resultIndex`, `harness`,
  available `scriptHash` and `harnessHash`, `startedAt`, `complete`, `model`, and
  available `modelDigest`.
- Condition and attempt: `workload`, `target`, `temperature`, `maxTokens`,
  `template`, `prompt`, `run`, and `seed`.
- Evidence: `passed`, available `promptTokens`, `completionTokens`,
  `reasoningTokens`, `elapsedMs`, `finishReason`, and `error`.
- Outcome classification: `failureReason` consumes the stored reason when
  present. For legacy rows without that field, it derives `null` for a recorded
  pass, `provider_error` for a failed row with an error, otherwise
  `word_count_mismatch` under v2.5's greeting rules. It does not diagnose why the
  model failed.

The reader copies `pass` into `passed`; it does not evaluate text again or infer
failure from truncation. A passing row stopped by `length` still passes. Stored
summaries and condition thresholds do not override individual attempt verdicts.

Missing or null telemetry remains `null`; zero remains zero. Historical artifacts
without prompt/reasoning tokens or per-attempt timing continue to emit `null` for
those fields. Token counts must be nonnegative safe integers, and elapsed time
must be a finite nonnegative number. Reasoning word counts cannot establish token
counts, and invocation timestamps cannot establish per-attempt timings.

Explicit failure reasons must agree with the saved verdict and error field;
unknown or contradictory reasons are rejected with source, row, and field
context. A null reason on a failed row is invalid. Legacy fallback applies only
when the field is absent. The consumer does not import execution code, inspect
raw `usage` for alternative counts, or emit it in analysis records; raw provider
details remain available in the original artifact.

Incomplete checkpoints are accepted with `complete: false`, including an empty
result list. Only saved attempts are emitted; missing attempts are not fabricated.
Validation checks consumed metadata and row fields, not the full raw artifact.
Errors identify the input path and, for invalid row fields, the result index and
field. All inputs must validate before any JSON is emitted. Success exits with
`0`, even when records contain failed attempts; input errors exit with `2` and
leave stdout empty. Use `--help` for usage.
