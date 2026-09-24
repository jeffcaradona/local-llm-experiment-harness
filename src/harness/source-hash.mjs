import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

// Explicit source list: add any new execution module here when extracting it.
// Prompt text is already retained in report.params and in every result row.
const root = new URL('../../', import.meta.url);
const sourcePaths = [
  'greeting-harness-v2.5.mjs',
  'src/harness/artifact-writer.mjs',
  'src/harness/provider.mjs',
  'src/harness/runner.mjs',
  'src/harness/source-hash.mjs',
  'workloads/greeting/workload.mjs',
];

export async function sourceIdentity() {
  const sourceHashes = {};
  for (const path of sourcePaths) {
    sourceHashes[path] = hash(await readFile(new URL(path, root)));
  }
  return {
    // Retain the original meaning of scriptHash for historical consumers.
    scriptHash: sourceHashes['greeting-harness-v2.5.mjs'],
    harnessHash: hash(JSON.stringify(sourceHashes)),
    sourceHashes,
  };
}
