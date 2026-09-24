import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { sourceIdentity } from '../src/harness/source-hash.mjs';

test('source identity covers extracted modules and changes when workload source changes', async (t) => {
  const original = await sourceIdentity();
  assert.deepEqual(Object.keys(original.sourceHashes), [
    'greeting-harness-v2.5.mjs',
    'src/harness/artifact-writer.mjs',
    'src/harness/provider.mjs',
    'src/harness/source-hash.mjs',
    'workloads/greeting/workload.mjs',
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'harness-identity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [path, hash] of Object.entries(original.sourceHashes)) {
    const content = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(hash, createHash('sha256').update(content).digest('hex').slice(0, 16));
    const destination = join(directory, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  // Resolve relative to the module, independent of the process working directory.
  const copied = await import(pathToFileURL(join(directory, 'src/harness/source-hash.mjs')).href);
  assert.deepEqual(await copied.sourceIdentity(), original);
  await writeFile(join(directory, 'workloads/greeting/workload.mjs'), '\n// changed workload\n', { flag: 'a' });
  const changed = await copied.sourceIdentity();
  assert.equal(changed.scriptHash, original.scriptHash);
  assert.notEqual(changed.harnessHash, original.harnessHash);
  assert.notEqual(changed.sourceHashes['workloads/greeting/workload.mjs'], original.sourceHashes['workloads/greeting/workload.mjs']);
  assert.equal(changed.sourceHashes['src/harness/provider.mjs'], original.sourceHashes['src/harness/provider.mjs']);
  assert.deepEqual(await copied.sourceIdentity(), changed, 'same source produces the same identity');
});
