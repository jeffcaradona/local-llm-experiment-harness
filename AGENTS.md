<!--
Document: AGENTS.md
Version: 1.0.0
Updated: 2026-09-23
Scope: Repository-wide agent instructions
Project: local-llm-experiment-harness
-->

# AGENTS.md

## Project

`local-llm-experiment-harness` is a Node.js experiment harness for studying local LLM behavior under controlled, reproducible configurations.

The original `greeting-harness-v2.5.mjs` experiment is the first workload, not the permanent identity of the project.

Milestone-specific requirements live under:

```text
.github/prompts/
```

Read the active milestone prompt before making substantial changes.

## Working Principles

Prefer:

- Node.js
- ESM
- imperative shell / functional core
- small explicit modules
- deterministic behavior where practical
- stable machine-readable artifacts
- junior-readable code
- comments that explain design intent
- minimal dependencies
- tests around meaningful behavioral boundaries

Avoid:

- unnecessary frameworks
- speculative abstractions
- premature generalization
- hidden mutable state
- refactors that change experimental behavior without a concrete reason

Do not introduce major technologies or architectural layers merely because they may be useful later.

## Architecture

Maintain this directional dependency:

```text
experiment harness
       |
       v
    results
       |
       +----> analysis
       |
       +----> classifiers / models
```

The harness must not depend on downstream analysis or classification code.

Human interpretation belongs in `notes/`.

Machine-generated evidence belongs in `results/`.

Trained model artifacts, when introduced, belong in `models/`.

## Workloads

A workload defines an experiment task such as the original greeting experiment.

Keep workload definitions explicit and simple.

Do not build a plugin framework merely to support hypothetical future workloads.

Changes that would invalidate comparison with historical results must be called out clearly.

## Experimental Reproducibility

Preserve, when available:

- workload identity
- harness/version identity
- model
- prompt/template identity
- target
- temperature
- maximum-token configuration
- generated output
- pass/fail result
- failure reason
- elapsed time
- token usage
- stop/finish reason
- provider-supplied reasoning-token information

Do not invent unavailable telemetry.

Preserve deterministic ordering of experiment combinations.

Do not silently overwrite historical experiment artifacts.

## Analysis

Analysis code is a consumer of experiment artifacts.

It should not require importing or executing the experiment harness.

Favor explicit transformations such as:

```text
result artifact
    ->
validated result
    ->
stable analysis record
```

Keep feature extraction deterministic.

## Machine Learning

Machine learning is a downstream concern, not part of the experiment-execution core.

When introduced in a later milestone:

- Node.js remains the primary application/runtime environment.
- Prefer inspectable, versioned model artifacts where practical.
- SQL Server may store experiment observations, labels, model metadata, evaluation metrics, and serialized model artifacts.
- SQL Server Machine Learning Services must not become a required runtime dependency.
- R and Python may be used for comparison, learning, or offline experimentation, but they are not core runtime dependencies.

Do not introduce ML unless the active milestone explicitly requires it.

## MCP and Agent Integration

MCP integration is a downstream capability.

Do not make experiment execution depend on MCP, GitHub Copilot, Codex, Claude Code, or any other agent runtime.

If MCP integration is introduced later, preserve the boundary between deterministic experiment evidence and agent interpretation.

## Testing

Prioritize deterministic tests for behavior that matters, including:

- experiment combination ordering
- workload configuration
- result normalization
- result validation
- analysis feature extraction
- malformed artifacts
- preservation of pass/fail semantics

Do not add tests solely to increase test count.

When fixing a defect, add a focused regression test when practical.

## Repository Hygiene

Do not commit:

- secrets
- API keys
- local `.env` files
- dependency directories
- transient logs
- editor-local state
- generated scratch files

Generated experiment results may be committed when intentionally retained as research evidence or fixtures.

Model artifacts may be committed when intentionally versioned and reasonably sized.

## Change Discipline

Before substantial implementation:

1. inspect the relevant existing code
2. inspect the active milestone prompt
3. identify behavior that must remain unchanged
4. prefer the smallest change that satisfies the milestone

After implementation:

1. run applicable deterministic tests
2. run an appropriate smoke test
3. report any tests or model calls that could not be run
4. summarize behavioral changes separately from structural refactoring
5. identify intentionally deferred work

## Agent Behavior

Do not expand the active milestone merely because a future improvement is obvious.

Do not change experiment prompts casually.

Do not hide uncertainty behind abstractions.

When evidence is incomplete, preserve the distinction between:

- observed fact
- derived result
- interpretation
- future hypothesis

Keep the project understandable enough that individual experimental decisions can be traced from configuration to artifact to analysis.
