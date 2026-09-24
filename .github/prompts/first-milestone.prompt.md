# Project: local-llm-experiment-harness

We are starting a new Node.js project called `local-llm-experiment-harness`.

The repository already has the basic directory structure. Before making changes, inspect the repository and describe what currently exists.

## Background

This project grows out of an earlier `greeting-harness-v2.5.mjs`.

That harness was originally built to explore local LLM behavior using a deliberately simple greeting-generation task. It produced useful experimental findings, including a surprising decoding anomaly:

* targets tested: `2,4,6,7,8,9,10,11,12,13`
* temperatures: `0` and `0.7`
* max tokens: `3200`
* at `temperature=0`, all tested targets passed except `target=10`
* `target=10` consistently truncated/failed
* neighboring `target=9` and `target=11` passed
* `target=10` recovered at `temperature=0.7`

The conclusion was that this was not a simple capacity threshold but an isolated/jagged greedy-decoding failure.

The new project should preserve the ability to reproduce that experiment while generalizing the harness so that "greeting" becomes merely the first workload.

## Architectural intent

Keep the project deliberately understandable.

Preferred style:

* Node.js
* ESM
* imperative shell / functional core
* deterministic behavior where practical
* small functions
* explicit data structures
* comments that explain design intent rather than restating code
* junior-readable implementation
* avoid frameworks unless they solve a real problem

Do not prematurely introduce abstractions merely because multiple workloads may exist someday.

The project should make experiments reproducible and leave clean seams for later analysis.

## Initial conceptual structure

The repository should support concepts roughly like:

```text
workloads/
  greeting/
    prompts/
    expectations/

results/

models/

notes/

src/
  harness/
  analysis/
  classifier/
```

Do not assume every directory must contain implementation code during milestone one.

The intended separation is:

```text
harness
  executes experiments
       |
       v
results/
  machine-generated evidence
       |
       +------> analysis
       |
       +------> classifier (later)

models/
  trained model artifacts (later)

notes/
  human-written lab notebook / interpretation
```

A critical architectural rule is:

> Downstream analysis and classifiers may consume harness results, but the experiment harness must not depend on them.

## Milestone One

The goal is to establish the reusable experiment-harness boundary while preserving the existing greeting experiment.

Do NOT add machine learning yet.

### 1. Preserve v2.5 behavior

Bring the existing `greeting-harness-v2.5.mjs` behavior into this repository with the smallest reasonable changes.

The original prompts should initially remain unchanged.

Do not "improve" the experiment prompt while restructuring the code because we need historical comparability.

### 2. Make greeting a workload

Extract only enough structure so the greeting experiment is recognizably a workload rather than the identity of the entire harness.

We should eventually be able to add another workload without cloning the entire harness implementation.

Avoid building a generic plugin framework.

Prefer a simple explicit workload definition.

### 3. Preserve experiment parameters

Continue supporting the important environment-driven experiment configuration, including the equivalent of:

```text
BASE_URL
TARGETS
TEMPERATURES
MAX_TOKENS_LIST
```

Preserve deterministic ordering of experimental combinations.

### 4. Preserve raw experimental evidence

Each experiment run should produce machine-readable JSON sufficient for later independent analysis.

Results should retain, where available:

* timestamp
* workload
* harness/version information
* model
* target
* temperature
* max token setting
* prompt/template identity
* generated output
* pass/fail
* failure classification/reason
* elapsed time
* token usage
* finish/stop reason
* any reasoning-token information available from the provider

Do not invent unavailable telemetry.

Raw evidence should not depend on future classifier-specific fields.

### 5. Add a stable analysis seam

Create the smallest useful downstream consumer of result files.

For milestone one this should NOT perform ML.

It should:

1. read one or more result JSON artifacts
2. validate the minimum structure it needs
3. deterministically extract a simple row/record suitable for later analysis
4. print or emit those records in a stable order

Example future feature fields might include:

```text
workload
target
temperature
maxTokens
promptTokens
completionTokens
reasoningTokens
elapsedMs
passed
failureReason
```

Do not force fields that the current artifacts cannot provide.

This analysis path should consume result artifacts without importing or depending on the execution path of the harness.

### 6. npm scripts

Provide clear scripts in `package.json`.

Something along these lines is desirable:

```text
npm run experiment:greeting
npm run analyze
npm test
```

Choose exact names after inspecting the repository.

Do not add classifier scripts yet unless placeholders already exist and removing them would be counterproductive.

### 7. Lab notebook

Create or preserve:

```text
notes/lab-notebook.md
```

This is human-authored experimental reasoning, not generated output.

Add a short initial entry documenting:

* migration/generalization from greeting-harness v2.5
* the known target=10 / temperature=0 observation
* the immediate next question: create stable experiment artifacts suitable for downstream statistical/classification analysis

Keep it concise.

## Future direction — context only

Do not implement these unless required to establish an obvious seam.

Later milestones are expected to explore:

### Classical ML

A separate results consumer may train models such as:

* binary logistic regression
* decision trees
* random forests

Possible first target:

```text
PASS / FAIL
```

using only information available before execution, such as:

```text
target
temperature
maxTokens
prompt size
model
```

We want to eventually answer questions like:

> Can the configuration of an experiment predict whether a local LLM run will fail?

The isolated `target=10`, `temperature=0` behavior is intentionally interesting because a simple linear classifier may fail to describe it well.

### Model artifacts

Later, simple models may be serialized as inspectable JSON.

SQL Server may eventually store:

* experiment observations
* labels
* metrics
* model metadata
* serialized JSON models

The runtime should remain ordinary Node.js. SQL Server Machine Learning Services must NOT become an architectural dependency because it will not be available in all environments.

### R and Python

R/Python may later be used as comparison or learning environments against the same dataset.

They are not runtime dependencies for this project.

### MCP

Much later, a trained classifier might be exposed through an MCP tool for use by GitHub Copilot or other agents.

Do not design the current milestone around MCP.

## Constraints

Do not:

* introduce ML in milestone one
* introduce a database
* introduce TypeScript unless the repository already uses it
* introduce a framework
* rewrite working behavior merely for stylistic cleanliness
* alter prompts in ways that invalidate comparison with v2.5
* mix human interpretation into machine-generated evidence
* make the harness depend on analysis/classification code
* invent abstractions for hypothetical future workloads

## Tests

Add deterministic tests around boundaries that matter.

Prioritize things such as:

* experiment combination ordering
* workload configuration
* result normalization
* analysis feature extraction
* malformed/missing result fields
* preservation of important pass/fail semantics

Do not write tests merely to increase test count.

## Working method

First:

1. inspect the repository
2. inspect the existing v2.5 implementation if present
3. explain the smallest proposed milestone-one change set
4. identify anything in the existing implementation that must remain unchanged for reproducibility

Then implement the milestone.

After implementation:

1. run the deterministic tests
2. run a smoke test that does not require unnecessary model calls where possible
3. show the final repository structure
4. summarize what changed
5. explicitly identify what was intentionally deferred

Keep the implementation bounded.

The success condition for milestone one is not "we built a generic experiment platform."

It is:

> The original greeting experiment still works, but its results now flow through a clean enough structure that another workload — and later a separate statistical/classification consumer — can be added without redesigning the project.
