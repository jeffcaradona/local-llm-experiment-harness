# local-llm-experiment-harness

A Node.js harness for reproducible local LLM experiments. The greeting v2.5
experiment is the first workload. Milestone one is being implemented in small,
tested increments, with a manual commit checkpoint after each increment.

Use Node.js 24 or newer and npm 11. Install development dependencies with
`npm ci`.

```sh
npm test
```

The compatibility tests launch the existing CLI with a mock provider. They make
no network or model calls, write results into temporary directories, and clean
up afterward. They protect the original prompts, defaults, sweep order, seed
reset, request parameters, template fallback, pass/fail semantics, and exit
statuses. The tests also serve as a CLI smoke test.

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

Each invocation writes a JSON artifact under `results/`, checkpointed after every
generation. A response passes when its whitespace-delimited word count equals
the target, even if its finish reason is `length`. The CLI exits with `0` when
every condition meets the pass-rate threshold, `1` when any condition falls
below it, and `2` on a fatal error. A per-generation HTTP error counts as a
failed attempt and the sweep continues.

Current structure:

```text
greeting-harness-v2.5.mjs       Original CLI, unchanged at checkpoint 1
prompt-templates.txt           Active v2.5 prompt file
workloads/greeting/            Prompt copy and expectations placeholder
src/harness/                  Execution-module placeholder
src/analysis/                 Independent-analysis placeholder
src/classifier/               Deferred placeholder
tests/                        CLI compatibility tests and mock provider
results/                      Experiment evidence
notes/lab-notebook.md          Human interpretation and migration notes
models/                       Deferred placeholder
```

Checkpoint 1 adds compatibility tests and documentation only. Next increments
will extract the greeting workload and reusable execution code, preserve richer
result evidence, and implement an independent analysis consumer. The existing
`npm run analyze` script points to a file that is not implemented yet;
`npm run lint` also awaits an ESLint configuration. Neither is currently a
working validation command. Machine learning and agent integrations are outside
milestone one.
