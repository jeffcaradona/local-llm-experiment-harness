<!--
Document: second-milestone.prompt.md
Version: 1.0.0
Updated: 2026-09-24
Project: local-llm-experiment-harness
Milestone: 2 - First classifier consumer with binary logistic regression
Companion Instructions: AGENTS.md v1.0.0
Depends On: Milestone 1 accepted
-->

# Milestone 2 Prompt

## Project

Continue work on:

`local-llm-experiment-harness`

Before making changes:

1. read `AGENTS.md`
2. inspect the current repository
3. inspect the Milestone 1 implementation and tests
4. inspect the retained experiment artifacts under `results/`
5. inspect the independent analysis consumer under `src/analysis/`

Repository-wide architecture, coding style, reproducibility rules, and agent behavior remain defined by `AGENTS.md`.

Milestone 1 is accepted.

Do not refactor the experiment harness merely because Milestone 2 introduces a new downstream consumer.

## Background

Milestone 1 established this real dependency direction:

```text
experiment harness
       |
       v
result artifacts
       |
       +----> analysis
       |
       +----> future classifiers
```

The greeting workload remains reproducible, and the retained pre/post-refactor experiment comparison showed no changed verdicts.

The known historical sweep includes:

```text
targets:
2,4,6,7,8,9,10,11,12,13

temperatures:
0,0.7

maxTokens:
3200

runs per condition:
10
```

The notable result remains:

```text
target=9,  temp=0   -> passes
target=10, temp=0   -> consistently fails/truncates
target=11, temp=0   -> passes

target=10, temp=0.7 -> passes
```

This is useful classifier data because the failure is not a simple monotonic capacity threshold.

Milestone 2 introduces the first classical machine-learning consumer of these experiment results.

## Goal

Build the smallest complete binary-classification workflow in Node.js:

```text
retained result JSON
       |
       v
analysis records
       |
       v
classifier dataset
       |
       v
binary logistic regression
       |
       +----> evaluation metrics
       |
       v
versioned JSON model artifact
```

The first prediction question is:

> Given only information available before the model call, what probability should we assign to this experiment attempt failing?

The classifier must not use post-run evidence to predict failure.

The purpose of this milestone is to establish and understand the modeling lifecycle.

It is NOT necessary for logistic regression to model the existing anomaly well.

A poor model is a valid and potentially important result.

## Classification Target

Treat failure as the positive class:

```text
FAIL = 1
PASS = 0
```

Using failure as the positive class makes metrics such as precision and recall directly describe our ability to identify risky experiment configurations.

The saved harness verdict remains authoritative.

Do not re-evaluate generated text to create new labels.

Use:

```text
record.passed === false -> FAIL
record.passed === true  -> PASS
```

## Features

For the first model, use only pre-run configuration fields:

```text
target
temperature
```

Do not add fields merely because they are available.

The retained baseline sweep has:

```text
maxTokens = 3200
```

for every observation, so `maxTokens` contains no useful variance in this dataset and should not be included in the initial model.

Likewise, the historical sweep uses one effective prompt representation for this comparison, so prompt/template identity should not initially be treated as a predictive feature.

Do NOT use:

```text
pass
failureReason
error
text
wordCount
finishReason
truncated
completionTokens
reasoningTokens
reasoningLength
elapsedMs
usage
```

as model inputs.

Those values are outcomes or post-run telemetry and would create label leakage.

`seed` and `run` should also remain excluded from the first feature set. They identify repeated attempts but are not currently hypothesized to be causal configuration features.

## Use the Existing Analysis Boundary

Do not create a second parser for harness result artifacts.

The classifier may depend on the stable analysis-record transformation created in Milestone 1.

The intended direction is:

```text
result JSON
    ->
src/analysis/result-records.mjs
    ->
classifier feature extraction
```

Classifier code must not import:

```text
src/harness/*
workloads/greeting/*
greeting-harness-v2.5.mjs
```

The classifier consumes evidence.

It does not execute experiments.

## Dataset Split

Use a deterministic held-out evaluation split.

For the retained 10-run-per-condition dataset, use attempt number:

```text
training:
run 1-8

held-out evaluation:
run 9-10
```

This creates an 80/20 split while retaining every experimental condition in both partitions.

Do not randomly shuffle the dataset.

The split rule must be explicit and recorded in model metadata.

The code should fail clearly if an input dataset cannot satisfy the expected split rather than silently inventing a different one.

This evaluation measures behavior on unseen attempts of known configurations.

Do not claim that it measures generalization to unseen targets, models, prompts, or workloads.

## Duplicate Historical Artifacts

The retained pre-refactor and post-refactor artifacts intentionally reproduce the same experiment and were shown to have identical verdicts.

Do not train on one and evaluate on the other as though they were independent datasets.

That would create misleading validation.

For Milestone 2, train and evaluate using one explicitly selected retained sweep artifact and the deterministic run-based split above.

The user must supply the artifact path explicitly.

Do not silently scan `results/`.

## Logistic Regression

Implement a small binary logistic-regression model directly in Node.js.

Do not introduce an ML framework or dependency for this milestone unless inspection reveals a compelling technical reason.

The implementation should be intentionally understandable.

Use deterministic batch training.

It should include:

```text
feature standardization
sigmoid probability
binary cross-entropy / log loss
fixed training iterations
fixed learning rate
optional small L2 regularization if needed for numerical stability
```

Training must contain no randomness.

Use numerically stable calculations where practical.

Do not build a general-purpose machine-learning library.

Implement only what this milestone requires.

## Feature Standardization

Calculate normalization parameters using the training partition only.

For every feature, persist:

```text
name
mean
standard deviation
```

Prediction must use the saved training normalization values.

Evaluation data must not influence normalization.

Reject an active feature with zero variance rather than dividing by zero or silently changing its meaning.

Feature ordering must be explicit and stable.

## JSON Model Artifact

Persist the trained model as readable JSON.

A model artifact should contain information equivalent to:

```json
{
  "schemaVersion": 1,
  "modelType": "binary-logistic-regression",
  "target": {
    "name": "failed",
    "positiveClass": "FAIL",
    "negativeClass": "PASS"
  },
  "features": [
    {
      "name": "target",
      "mean": 0,
      "standardDeviation": 1
    },
    {
      "name": "temperature",
      "mean": 0,
      "standardDeviation": 1
    }
  ],
  "parameters": {
    "intercept": 0,
    "weights": [0, 0]
  },
  "training": {
    "iterations": 0,
    "learningRate": 0,
    "l2": 0,
    "split": "runs 1-8 train; runs 9-10 evaluation"
  },
  "source": {},
  "metrics": {}
}
```

This is illustrative, not a required literal schema.

Choose the exact structure deliberately and test it.

The model artifact must include enough information to reproduce inference without access to the training implementation's in-memory state.

Include provenance for the training artifact, including at minimum:

```text
input path
SHA-256
training record count
evaluation record count
harness identity when available
model identity/digest when available
```

Do not silently overwrite an existing model artifact.

## Model Location

Write intentional trained models under:

```text
models/
```

A reasonable first filename would be equivalent to:

```text
models/greeting-failure-logistic-v1.json
```

Do not put model artifacts in `results/`.

## Training CLI

Add a command equivalent to:

```text
npm run classifier:train -- <result.json> <model.json>
```

Exact argument handling may vary slightly if a clearer interface emerges during implementation.

The command should:

1. read the explicitly supplied result artifact
2. transform it through the existing analysis boundary
3. create the deterministic train/evaluation split
4. extract pre-run features
5. train the logistic regression
6. evaluate it on held-out records
7. write the JSON model
8. print a concise training/evaluation summary

Training must not make any model/API calls.

## Prediction CLI

Add a command equivalent to:

```text
npm run classifier:predict -- <model.json> <target> <temperature>
```

It should return structured output containing at least:

```text
probability of FAIL
probability of PASS
threshold
predicted class
model identity/version
```

Use a default classification threshold of:

```text
0.5
```

The probability is the primary model output.

The threshold converts that probability into a discrete class.

Do not describe the probability as certainty.

## Evaluation Metrics

For the held-out evaluation partition, calculate at least:

```text
total observations
PASS count
FAIL count
true positives
false positives
true negatives
false negatives
accuracy
precision for FAIL
recall for FAIL
specificity
F1 for FAIL
log loss
Brier score
```

Handle zero-denominator cases explicitly.

Do not return `NaN` or `Infinity` in persisted JSON.

Also calculate the trivial majority-class baseline for comparison.

Because this dataset is heavily PASS-dominant, accuracy by itself may be misleading.

If logistic regression simply predicts PASS for nearly everything, preserve that result.

Do not tune metrics or thresholds merely to make the model appear successful.

## Expected Learning Outcome

This dataset contains an isolated failure region that may not be well represented by a linear decision boundary.

That is useful.

If logistic regression performs poorly at identifying the `target=10, temperature=0` anomaly, document that result rather than adding hidden features or increasingly complex transformations to rescue the model.

A later milestone may compare logistic regression with a tree-based classifier.

Milestone 2 is about understanding the baseline.

## Suggested Internal Structure

Keep the implementation small.

Something approximately like this is reasonable:

```text
src/classifier/
  dataset.mjs
  logistic-regression.mjs
  metrics.mjs
  model-artifact.mjs
  train.mjs
  predict.mjs
```

Do not create files merely to match this suggestion.

Prefer fewer clear modules over unnecessary decomposition.

## Tests

Add deterministic tests around the behavior that matters.

At minimum, cover:

```text
feature extraction uses only the intended pre-run fields

PASS/FAIL labels come from recorded verdicts

training/evaluation split is deterministic

evaluation records do not influence normalization

feature order is stable

zero-variance active features are rejected

logistic regression learns a simple synthetic separable dataset

training the same dataset twice produces identical parameters

JSON serialization/deserialization preserves predictions

prediction from a saved model matches prediction before serialization

model files are not silently overwritten

metric calculations handle class imbalance and zero denominators

classifier code consumes analysis records rather than execution code

retained experiment artifact can train and evaluate end-to-end
```

Do not add tests merely for coverage count.

No test should require a live local LLM.

## Experiment Notebook

Add a Milestone 2 entry to:

```text
notes/lab-notebook.md
```

Record:

```text
question:
Can pre-run experiment configuration predict harness failure?

model:
binary logistic regression

positive class:
FAIL

features:
target
temperature

split:
runs 1-8 train
runs 9-10 evaluate
```

After running the real retained dataset, record the observed evaluation metrics and interpretation.

Clearly distinguish:

```text
observed result
interpretation
next hypothesis
```

Do not claim that one historical greeting sweep establishes broad predictive validity.

## Explicitly Deferred

Do not introduce in Milestone 2:

```text
SQL Server
SQL Server ML Services
R
Python
ONNX
MCP
GitHub Copilot integration
Jev or external classifier services
decision trees
random forests
neural networks
automatic hyperparameter tuning
cross-validation frameworks
generic feature pipelines
generic ML plugin architectures
new experiment workloads
new prompt experiments
```

Those are potential later milestones.

## Harness Stability

Do not modify greeting-harness behavior merely to support the classifier.

Do not change:

```text
prompt semantics
sweep ordering
pass/fail semantics
provider protocol
artifact meaning
historical compatibility behavior
```

unless a real defect is discovered.

If a harness change appears necessary, stop and explain why before coupling it to the classifier work.

The desired dependency direction remains:

```text
harness
   |
   v
artifact
   |
   v
analysis
   |
   v
classifier
```

Never reverse that dependency.

## Working Sequence

Before implementation:

1. inspect the current repository
2. confirm Milestone 1 tests still pass
3. inspect the retained sweep artifact
4. inspect the analysis-record shape
5. identify the exact classifier feature and label contract
6. explain the smallest proposed change set

Then implement Milestone 2.

After implementation:

1. run all existing tests
2. run all new classifier tests
3. run ESLint
4. train the classifier against one retained sweep artifact
5. persist the JSON model
6. evaluate the held-out partition
7. use the saved model to score at least these configurations:

```text
target=9,  temperature=0
target=10, temperature=0
target=10, temperature=0.7
target=11, temperature=0
```

8. confirm predictions are identical before and after model serialization
9. summarize what the classifier actually learned
10. explicitly identify limitations and deferred work

Do not make new local-LLM calls for this milestone unless required to diagnose an unrelated regression.

## Success Condition

Milestone 2 is successful when:

> An existing greeting-harness result artifact can be consumed independently, converted into a deterministic pre-run feature dataset, used to train a binary logistic-regression classifier entirely in Node.js, serialized as an inspectable JSON model, reloaded, and evaluated reproducibly against held-out attempts.

Success does NOT require high predictive accuracy.

A valid result may be:

> Logistic regression is an inadequate model for this isolated failure topology.

That would establish the classifier pipeline and provide the evidence needed to justify the next model class rather than assuming a more complicated model is necessary.