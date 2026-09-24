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

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

const DEFAULT_TEMPLATE = 'Write a greeting with a {target}-word count';

// 0-20 only — this project's targets have never gone past 13, and a full
// number-to-words library is more machinery than this needs.
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];
const spellNumber = (target) => NUMBER_WORDS[target] ?? String(target); // falls back to the numeral past 20

async function loadTemplates() {
  try {
    const raw = await readFile(PROMPT_TEMPLATES_FILE, 'utf8');
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    if (lines.length === 0) throw new Error('template file is empty after stripping comments/blank lines');
    return { templates: lines, source: PROMPT_TEMPLATES_FILE };
  } catch (err) {
    console.log(`Could not load ${PROMPT_TEMPLATES_FILE} (${err.code ?? err.message}); falling back to the single default template.`);
    return { templates: [DEFAULT_TEMPLATE], source: null };
  }
}

const promptFor = (template, target) => template.replaceAll('{target}', String(target)).replaceAll('{spelledNumber}', spellNumber(target));
const countWords = (s) => s.trim().split(/\s+/).filter(Boolean).length;

async function selfHash() {
  const self = fileURLToPath(import.meta.url);
  const src = await readFile(self);
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}

async function getModelDigest() {
  const apiBase = BASE_URL.replace(/\/v1\/?$/, '');
  const res = await fetch(`${apiBase}/api/tags`);
  if (!res.ok) return null;
  const data = await res.json();
  const match = data.models?.find((m) => m.name === MODEL || m.model === MODEL);
  return match?.digest ?? null;
}

async function callModel({ prompt, temperature, seed, maxTokens }) {
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    temperature,
    seed,
    max_tokens: maxTokens,
    options: { num_predict: maxTokens },
  };
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  const text = (choice?.message?.content ?? '').trim();
  const reasoning = choice?.message?.reasoning ?? null;
  const finishReason = choice?.finish_reason ?? null;
  const completionTokens = data.usage?.completion_tokens ?? null;
  return { request: body, text, reasoning, finishReason, completionTokens };
}

function buildReport({ scriptHash, startedAt, modelDigest, templates, templatesSource, matrix, allResults, finished }) {
  const failingConditions = matrix.filter((m) => m.passRate < THRESHOLD);
  return {
    harness: 'greeting-harness-v2.5',
    scriptHash,
    startedAt,
    finishedAt: finished ? new Date().toISOString() : null,
    complete: finished,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      baseUrl: BASE_URL,
      model: MODEL,
      modelDigest,
    },
    params: {
      runsPerCondition: RUNS_PER_CONDITION,
      targets: TARGETS,
      temperatures: TEMPERATURES,
      maxTokensList: MAX_TOKENS_LIST,
      promptTemplatesFile: templatesSource,
      promptTemplates: templates,
      baseSeed: BASE_SEED,
      threshold: THRESHOLD,
      timeoutMs: TIMEOUT_MS,
    },
    matrix,
    failingConditions,
    results: allResults,
  };
}

async function main() {
  const scriptHash = await selfHash();
  const startedAt = new Date().toISOString();
  const modelDigest = await getModelDigest();
  const { templates, source: templatesSource } = await loadTemplates();

  console.log(`Templates (${templates.length}):`);
  templates.forEach((t, i) => console.log(`  [${i}] ${t}`));
  console.log('');

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = `${OUT_DIR}/${startedAt.replace(/[:.]/g, '-')}.json`;

  const allResults = [];
  const matrix = [];

  const persist = (finished) =>
    writeFile(
      outPath,
      JSON.stringify(buildReport({ scriptHash, startedAt, modelDigest, templates, templatesSource, matrix, allResults, finished }), null, 2)
    );

  for (const target of TARGETS) {
    for (const temperature of TEMPERATURES) {
      for (const maxTokens of MAX_TOKENS_LIST) {
        for (const template of templates) {
          const prompt = promptFor(template, target);
          const conditionResults = [];

          for (let i = 0; i < RUNS_PER_CONDITION; i++) {
            const seed = BASE_SEED + i;
            let row;
            try {
              const { request, text, reasoning, finishReason, completionTokens } = await callModel({
                prompt,
                temperature,
                seed,
                maxTokens,
              });
              const n = countWords(text);
              const pass = n === target;
              const truncated = finishReason === 'length';
              const reasoningLength = reasoning ? countWords(reasoning) : null;
              row = {
                target,
                temperature,
                maxTokens,
                template,
                prompt,
                seed,
                run: i + 1,
                request,
                text,
                reasoning,
                reasoningLength,
                wordCount: n,
                pass,
                finishReason,
                completionTokens,
                truncated,
              };
              console.log(
                `target=${target} temp=${temperature} max=${maxTokens} tmpl=${JSON.stringify(template)} seed=${seed}  ${pass ? 'PASS' : 'FAIL'}${truncated ? ' (truncated)' : ''}  ${n} words  reasoning=${reasoningLength ?? 'n/a'} words`
              );
            } catch (err) {
              row = {
                target,
                temperature,
                maxTokens,
                template,
                prompt,
                seed,
                run: i + 1,
                error: err.message,
                pass: false,
                truncated: false,
              };
              console.log(`target=${target} temp=${temperature} max=${maxTokens} tmpl=${JSON.stringify(template)} seed=${seed}  ERROR  ${err.message}`);
            }
            conditionResults.push(row);
            allResults.push(row);
            await persist(false); // checkpoint after every run so a crash loses at most one call
          }

          const passCount = conditionResults.filter((r) => r.pass).length;
          const truncatedCount = conditionResults.filter((r) => r.truncated).length;
          const avgReasoningLength = (() => {
            const lengths = conditionResults.map((r) => r.reasoningLength).filter((v) => typeof v === 'number');
            return lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null;
          })();
          const passRate = passCount / RUNS_PER_CONDITION;
          matrix.push({
            target,
            temperature,
            maxTokens,
            template,
            passCount,
            truncatedCount,
            avgReasoningLength,
            runs: RUNS_PER_CONDITION,
            passRate,
          });
        }
      }
    }
  }

  const failingConditions = matrix.filter((m) => m.passRate < THRESHOLD);
  const allPassed = failingConditions.length === 0;

  console.log('\nPass-rate matrix:');
  console.table(matrix.map((m) => ({ ...m, passRate: `${(m.passRate * 100).toFixed(0)}%` })));

  await persist(true);

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

  console.log(`\nResult file: ${outPath}`);
  console.log(`Script hash: ${scriptHash}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
