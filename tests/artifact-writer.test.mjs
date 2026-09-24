import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { createArtifact } from '../src/harness/artifact-writer.mjs';

const startedAt = '2026-09-24T12:00:00.000Z';
const filename = '2026-09-24T12-00-00-000Z.json';
const initial = { startedAt, complete: false, results: [] };

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'artifact-writer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('artifact creation saves an initial checkpoint and updates the same file', async (t) => {
  const directory = join(await temporaryDirectory(t), 'results');
  const artifact = await createArtifact(directory, startedAt, initial);
  assert.equal(basename(artifact.path), filename);
  assert.deepEqual(JSON.parse(await readFile(artifact.path, 'utf8')), initial);
  const checkpoint = { ...initial, results: [{ pass: true }] };
  await artifact.persist(checkpoint);
  assert.deepEqual(JSON.parse(await readFile(artifact.path, 'utf8')), checkpoint);
  // A shorter replacement must not retain trailing bytes from the previous JSON.
  await artifact.persist({ complete: true });
  assert.deepEqual(JSON.parse(await readFile(artifact.path, 'utf8')), { complete: true });
  assert.deepEqual(await readdir(directory), [filename]);
});

test('concurrent collisions preserve historical bytes and isolate every invocation', async (t) => {
  const directory = await temporaryDirectory(t);
  const historical = join(directory, filename);
  const original = '{ "historical": true }\n';
  await writeFile(historical, original);
  const artifacts = await Promise.all(Array.from({ length: 4 }, () => createArtifact(directory, startedAt, initial)));
  assert.equal(new Set(artifacts.map((a) => a.path)).size, 4);
  assert.deepEqual(artifacts.map((a) => basename(a.path)).sort(),
    [1, 2, 3, 4].map((suffix) => filename.replace('.json', `-${suffix}.json`)));
  for (const [index, artifact] of artifacts.entries()) {
    await artifact.persist({ ...initial, complete: true, results: [{ index }] });
  }
  for (const [index, artifact] of artifacts.entries()) {
    assert.deepEqual(JSON.parse(await readFile(artifact.path, 'utf8')).results, [{ index }]);
  }
  assert.equal(await readFile(historical, 'utf8'), original);
});

test('creation and checkpoint errors propagate instead of being treated as collisions', async (t) => {
  const directory = await temporaryDirectory(t);
  const blocked = join(directory, 'file');
  await writeFile(blocked, 'preserve');
  await assert.rejects(createArtifact(blocked, startedAt, initial));
  assert.equal(await readFile(blocked, 'utf8'), 'preserve');
  const artifact = await createArtifact(directory, startedAt, initial);
  await unlink(artifact.path);
  await mkdir(artifact.path);
  await assert.rejects(artifact.persist(initial));
});
