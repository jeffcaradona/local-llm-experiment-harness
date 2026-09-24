<!--
Document: first-milestone.prompt.md
Version: 1.0.0
Updated: 2026-09-23
Project: local-llm-experiment-harness
Milestone: 1 - Generalize greeting-harness v2.5 into a reusable experiment harness
Companion Instructions: AGENTS.md v1.0.0
-->

# First Milestone Prompt

## Project

We are starting a new Node.js project called `local-llm-experiment-harness`.

Before making changes:

1. read `AGENTS.md`
2. inspect the repository
3. inspect the existing `greeting-harness-v2.5.mjs` implementation if present
4. describe what currently exists

Repository-wide architecture, coding style, testing discipline, reproducibility rules, and agent behavior are defined in `AGENTS.md`.

This prompt defines only the scope and acceptance criteria for milestone one.

## Background

This project grows out of an earlier `greeting-harness-v2.5.mjs`.

That harness was originally built to explore local LLM behavior using a deliberately simple greeting-generation task.

It produced a notable finding under this sweep:

- targets: `2,4,6,7,8,9,10,11,12,13`
- temperatures: `0` and `0.7`
- max tokens: `3200`

Observed behavior:

- at `temperature=0`, all tested targets passed except `target=10`
- `target=10` consistently truncated/failed
- neighboring `target=9` and `target=11` passed
- `target=10` recovered at `temperature=0.7`

The current interpretation is that this was not a simple capacity threshold but an isolated or jagged greedy-decoding failure.

Milestone one must preserve the ability to reproduce and analyze that experiment.

## Goal

Establish the reusable experiment-harness boundary while preserving the existing greeting experiment.

The greeting task becomes the first workload rather than the identity of the whole harness.

Do not add machine learning in this milestone.

## Expected Conceptual Structure

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

Do not force implementation into every directory.

Empty or future-facing directories may remain placeholders when that keeps the milestone smaller.

## Required Work

### 1. Preserve v2.5 behavior

Bring the existing `greeting-harness-v2.5.mjs` behavior into this repository with the smallest reasonable changes.

The original prompts must initially remain unchanged.

Do not improve, rewrite, simplify, or retune the prompt while restructuring the project.

Historical comparability matters more than stylistic cleanup.

### 2. Make greeting a workload

Extract only enough structure so the greeting experiment is recognizably a workload rather than the identity of the entire harness.

A second workload should be addable later without cloning the entire harness implementation.

Do not build a plugin system, registry framework, dependency-injection container, or other generalized workload architecture.

Prefer one explicit workload definition and one clear execution path.

### 3. Preserve experiment parameters

Continue supporting the important environment-driven experiment configuration, including the equivalent of:

```text
BASE_URL
TARGETS
TEMPERATURES
MAX_TOKENS_LIST
```

Preserve deterministic ordering of experimental combinations.

If additional existing configuration is required for v2.5 compatibility, preserve it as well.

### 4. Preserve raw experimental evidence

Each experiment run should produce machine-readable JSON sufficient for later independent analysis.

Retain, where actually available:

- timestamp
- workload
- harness/version information
- model
- target
- temperature
- max token setting
- prompt/template identity
- generated output
- pass/fail
- failure classification or reason
- elapsed time
- token usage
- finish/stop reason
- reasoning-token information exposed by the provider

Do not invent unavailable telemetry.

Do not add classifier-specific fields to the raw evidence format.

### 5. Add the first downstream analysis seam

Create the smallest useful consumer of result files.

It must not perform machine learning.

It should:

1. read one or more result JSON artifacts
2. validate the minimum structure it requires
3. deterministically extract a simple analysis record
4. print or emit those records in stable order

Useful fields may include:

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

Only use fields the current artifacts can support.

The analysis path must consume result artifacts independently of the harness execution path.

### 6. npm scripts

Provide clear scripts in `package.json`.

The desired command surface is approximately:

```text
npm run experiment:greeting
npm run analyze
npm test
```

Choose exact names after inspecting the repository.

Do not add classifier-training or prediction scripts in this milestone unless they already exist and removing them would be counterproductive.

### 7. Lab notebook

Create or preserve:

```text
notes/lab-notebook.md
```

Add a concise initial entry documenting:

- migration/generalization from greeting-harness v2.5
- the known `target=10`, `temperature=0` observation
- the immediate next question: create stable experiment artifacts suitable for downstream statistical or classification analysis

The notebook is human-authored interpretation, not generated experiment output.

## Explicitly Deferred

Do not implement the following in milestone one:

- machine learning
- classifiers
- model training
- model serialization
- SQL Server
- R or Python workflows
- ONNX
- MCP integration
- GitHub Copilot-specific integration
- TypeScript migration
- application frameworks
- generic workload plugin systems

These are future directions only.

## Tests

Add deterministic tests only where they establish meaningful milestone behavior.

Prioritize:

- experiment combination ordering
- workload configuration
- result normalization
- analysis feature extraction
- malformed or missing result fields
- preservation of important pass/fail semantics

Do not add tests merely to increase coverage or test count.

## Working Sequence

Before implementation:

1. inspect the repository
2. inspect `AGENTS.md`
3. inspect the existing v2.5 implementation
4. explain the smallest proposed milestone-one change set
5. identify behavior that must remain unchanged for reproducibility

Then implement the milestone without expanding its scope.

After implementation:

1. run deterministic tests
2. run a smoke test that avoids unnecessary model calls where practical
3. show the final repository structure
4. summarize behavioral changes
5. summarize structural changes
6. identify anything intentionally deferred
7. report anything that could not be validated

## Success Condition

Milestone one is successful when:

> The original greeting experiment still works, but its results now flow through a clean enough structure that another workload, and later a separate statistical or classification consumer, can be added without redesigning the project.

Do not optimize this milestone for a hypothetical future platform.

Optimize it for preserving the existing experiment while establishing one clean reusable seam.
