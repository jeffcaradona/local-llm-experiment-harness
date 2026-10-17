// greeting-harness-v2.5.mjs — adds a prompt-representation dimension on top of
// greeting-harness-v2.4.mjs
//
// v2.4's follow-up sweep (run separately, not part of this file's history)
// showed that target=10/temp=0 is an isolated failure surrounded by clean
// passes at 9 and 11, and ruled out token budget as the cause (8x more budget
// just gave the reasoning loop more room to run). That leaves the question
// this project has not touched yet: is the failure about the SEMANTIC task
// (produce exactly ten words) or about the specific SURFACE FORM of the
// request (the literal digits "10", this exact sentence structure)? Every
// version so far has swept a numeric parameter (target, temperature, token
// budget) while holding the prompt's wording fixed. This version holds the
// task constant and sweeps the wording instead.
//
// What's new in this version:
//   - prompt templates are no longer a single hardcoded string — they're
//     loaded from a text file (PROMPT_TEMPLATES_FILE, default
//     ./prompt-templates.txt), one template per line, using {target} (numeral)
//     and/or {spelledNumber} (spelled-out number, 0-20) as placeholders. This is a
//     file rather than a comma-separated env var (the pattern used for
//     TARGETS/TEMPERATURES/MAX_TOKENS_LIST) because these are natural-language
//     strings that can contain commas and spaces — cramming them into one
//     shell-escaped env var line was going to be fragile and unreadable in a
//     way the numeric sweeps never were
//   - `template` becomes a fourth swept dimension (alongside target,
//     temperature, maxTokens), same nested-loop pattern as before
//   - TARGETS defaults to "10,8": 10 is the known failing condition, 8 is a
//     known-good control run through the same template sweep. Without the
//     control, a template that "fixes" target=10 can't be distinguished from
//     a template that's just generally more reliable and would have improved
//     8 too — the control is what lets a result say something about the
//     number 10 specifically, not about prompt quality in general
//   - if PROMPT_TEMPLATES_FILE doesn't exist, falls back to the single
//     original template, so existing invocations of this script without the
//     file still behave like v2.4's fixed-prompt sweep
//
// This is deliberately NOT another dimension added to the existing numeric
// sweep — per the recommendation that prompted this version, the next useful
// experiment holds task difficulty constant and perturbs representation, not
// the other way around.
//
// Usage: node greeting-harness-v2.5.mjs [runsPerCondition]
// Env:   BASE_URL              (default http://redshift:11434/v1)
//        MODEL                 (default nemotron-3-nano:4b)
//        OUT_DIR               (default ./results)
//        TARGETS               (default "10,8") — 10 = known failure, 8 = control
//        TEMPERATURES          (default "0") — greedy decoding, where the hole lives
//        MAX_TOKENS_LIST       (default "3200") — largest budget tested so far
//        PROMPT_TEMPLATES_FILE (default ./prompt-templates.txt)
//        BASE_SEED             (default 1)
//        THRESHOLD             (default 0.8) — min acceptable pass rate per condition
//        TIMEOUT_MS            (default 180000) — per-call timeout

import { runExperiment } from './src/harness/runner.mjs';
import { sourceIdentity } from './src/harness/source-hash.mjs';
import { greetingWorkload } from './workloads/greeting/workload.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://redshift:11434/v1';
const MODEL = process.env.MODEL ?? 'nemotron-3-nano:4b';
const OUT_DIR = process.env.OUT_DIR ?? './results';
const RUNS_PER_CONDITION = Number(process.argv[2] ?? 10);

const TARGETS = (process.env.TARGETS ?? '10,8').split(',').map(Number);
const TEMPERATURES = (process.env.TEMPERATURES ?? '0').split(',').map(Number);
const MAX_TOKENS_LIST = (process.env.MAX_TOKENS_LIST ?? '3200').split(',').map(Number);
const PROMPT_TEMPLATES_FILE = process.env.PROMPT_TEMPLATES_FILE ?? './prompt-templates.txt';
const BASE_SEED = Number(process.env.BASE_SEED ?? 1);
const THRESHOLD = Number(process.env.THRESHOLD ?? 0.8);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 180_000);

function printAttempt(row) {
  const { target, temperature, maxTokens, template, seed, pass, truncated, wordCount, reasoningLength, error } = row;
  if ('error' in row) {
    console.log(`target=${target} temp=${temperature} max=${maxTokens} tmpl=${JSON.stringify(template)} seed=${seed}  ERROR  ${error}`);
  } else {
    console.log(
      `target=${target} temp=${temperature} max=${maxTokens} tmpl=${JSON.stringify(template)} seed=${seed}  ${pass ? 'PASS' : 'FAIL'}${truncated ? ' (truncated)' : ''}  ${wordCount} words  reasoning=${reasoningLength ?? 'n/a'} words`
    );
  }
}

async function main() {
  const identity = await sourceIdentity();
  const { report, artifactPath, allPassed } = await runExperiment({
    config: {
      harness: 'greeting-harness-v2.5',
      baseUrl: BASE_URL,
      model: MODEL,
      outDir: OUT_DIR,
      runsPerCondition: RUNS_PER_CONDITION,
      targets: TARGETS,
      temperatures: TEMPERATURES,
      maxTokensList: MAX_TOKENS_LIST,
      promptTemplatesFile: PROMPT_TEMPLATES_FILE,
      baseSeed: BASE_SEED,
      threshold: THRESHOLD,
      timeoutMs: TIMEOUT_MS,
    },
    workload: greetingWorkload,
    identity,
    onTemplates(templates) {
      console.log(`Templates (${templates.length}):`);
      templates.forEach((t, i) => console.log(`  [${i}] ${t}`));
      console.log('');
    },
    onAttempt: printAttempt,
    onMatrix(matrix) {
      console.log('\nPass-rate matrix:');
      console.table(matrix.map((m) => ({ ...m, passRate: `${(m.passRate * 100).toFixed(0)}%` })));
    },
  });
  const { matrix, failingConditions } = report;

  console.log(`\n${allPassed ? 'ALL CONDITIONS PASSED' : `${failingConditions.length} condition(s) BELOW THRESHOLD (${THRESHOLD})`}`);

  // Compare the fixed target=10 rows across templates specifically — this is
  // the actual question this version was built to answer: does the hole move
  // or disappear when only the wording changes?
  const target10 = matrix.filter((m) => m.target === 10);
  if (target10.length > 1) {
    console.log('\ntarget=10 across templates:');
    target10.forEach((m) => {
      console.log(`  ${(m.passRate * 100).toFixed(0)}% (${m.passCount}/${m.runs}, avg reasoning ${m.avgReasoningLength ?? 'n/a'} words)  ${JSON.stringify(m.template)}`);
    });
  }

  console.log(`\nResult file: ${artifactPath}`);
  console.log(`Script hash: ${identity.scriptHash}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
