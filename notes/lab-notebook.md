# Lab Notebook

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

