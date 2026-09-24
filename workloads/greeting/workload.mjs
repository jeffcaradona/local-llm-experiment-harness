import { readFile } from 'node:fs/promises';

const DEFAULT_TEMPLATE = 'Write a greeting with a {target}-word count';
// Keep v2.5's spelling range and numeral fallback, including targets above 20.
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];
const countWords = (s) => s.trim().split(/\s+/).filter(Boolean).length;

async function loadTemplates(path) {
  try {
    const raw = await readFile(path, 'utf8');
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    if (lines.length === 0) throw new Error('template file is empty after stripping comments/blank lines');
    return { templates: lines, source: path };
  } catch (err) {
    console.log(`Could not load ${path} (${err.code ?? err.message}); falling back to the single default template.`);
    return { templates: [DEFAULT_TEMPLATE], source: null };
  }
}

function promptFor(template, target) {
  const spelledNumber = NUMBER_WORDS[target] ?? String(target);
  return template.replaceAll('{target}', String(target)).replaceAll('{spelledNumber}', spelledNumber);
}

function evaluate({ text, reasoning, finishReason }, target) {
  const wordCount = countWords(text);
  return {
    // Reasoning length is a whitespace word count, never a token estimate.
    reasoningLength: reasoning ? countWords(reasoning) : null,
    wordCount,
    pass: wordCount === target,
    // Historical pass is solely word count; truncation does not veto it.
    truncated: finishReason === 'length',
  };
}

function summarize(rows, runs) {
  const passCount = rows.filter((r) => r.pass).length;
  const truncatedCount = rows.filter((r) => r.truncated).length;
  const lengths = rows.map((r) => r.reasoningLength).filter((v) => typeof v === 'number');
  const avgReasoningLength = lengths.length
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : null;
  return { passCount, truncatedCount, avgReasoningLength, runs, passRate: passCount / runs };
}

// One explicit workload, with no registration or module-loading framework.
export const greetingWorkload = {
  id: 'greeting',
  loadTemplates,
  promptFor,
  evaluate,
  summarize,
};
