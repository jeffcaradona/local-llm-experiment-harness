import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

let calls = 0;

// Preload only in the CLI compatibility tests. Replacing fetch here lets the
// real CLI write artifacts without contacting a model or opening a socket.
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith('/api/tags')) {
    if (process.env.HARNESS_TEST_SCENARIO === 'unavailable') {
      throw new Error('Mock provider unavailable');
    }
    return Response.json({ models: [{ name: 'fixture-model', digest: 'fixture-digest' }] });
  }
  if (!String(url).endsWith('/chat/completions') || options?.method !== 'POST') {
    throw new Error(`Unexpected test request: ${url}`);
  }

  const request = JSON.parse(options.body);
  if (process.env.HARNESS_TEST_SCENARIO === 'checkpoints') {
    const files = await readdir(process.env.OUT_DIR);
    assert.equal(files.length, 1);
    const checkpoint = JSON.parse(await readFile(join(process.env.OUT_DIR, files[0]), 'utf8'));
    assert.equal(checkpoint.complete, false);
    assert.equal(checkpoint.results.length, calls++);
  }
  const mixed = process.env.HARNESS_TEST_SCENARIO === 'mixed';
  if (mixed && request.seed === 7) return new Response('Mock failure', { status: 500 });
  if (mixed && request.seed === 8) return Response.json({});

  return Response.json({
    choices: [{
      message: {
        content: mixed && request.seed === 6 ? 'Hello' : '  Hello\tthere!\n',
        reasoning: process.env.HARNESS_TEST_SCENARIO === 'evaluation-error' ? {} : 'Count two words',
      },
      finish_reason: mixed && request.seed === 5 ? 'length' : 'stop',
    }],
    usage: { prompt_tokens: 12, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 3 } },
  });
};
