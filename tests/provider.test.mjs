import assert from 'node:assert/strict';
import test from 'node:test';
import { callModel, getModelDigest } from '../src/harness/provider.mjs';

const config = { baseUrl: 'http://provider.invalid/v1', model: 'test-model', timeoutMs: 1000 };

test('provider discovery retains name/model matching and unavailable-digest behavior', async (t) => {
  const responses = [
    Response.json({ models: [{ name: config.model, digest: 'by-name' }] }),
    Response.json({ models: [{ model: config.model, digest: 'by-model' }] }),
    Response.json({ models: [{ name: 'other', digest: 'unrelated' }] }),
    new Response('', { status: 404 }),
  ];
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return responses.shift();
  });
  for (const expected of ['by-name', 'by-model', null, null]) {
    assert.equal(await getModelDigest({ ...config, baseUrl: `${config.baseUrl}/` }), expected);
  }
  assert.deepEqual(urls, Array(4).fill('http://provider.invalid/api/tags'));
});

test('provider calls preserve request options and first-choice normalization', async (t) => {
  const prompt = 'Keep this prompt exactly.';
  const request = {
    model: config.model, messages: [{ role: 'user', content: prompt }], stream: false,
    temperature: 0.7, seed: 9, max_tokens: 64, options: { num_predict: 64 },
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://provider.invalid/v1/chat/completions');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(options.body), request);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({
      choices: [
        { message: { content: '  Hello\nthere  ', reasoning: '  count words  ' }, finish_reason: 'length' },
        { message: { content: 'ignored' } },
      ],
      usage: { completion_tokens: 0 },
    });
  });
  assert.deepEqual(await callModel({ ...config, prompt, temperature: 0.7, seed: 9, maxTokens: 64 }), {
    request, text: 'Hello\nthere', reasoning: '  count words  ', finishReason: 'length', completionTokens: 0,
  });
});

test('provider errors propagate while missing response fields retain v2.5 defaults', async (t) => {
  const args = { ...config, prompt: 'test', temperature: 0, seed: 1, maxTokens: 64 };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  const { request, ...response } = await callModel(args);
  assert.equal(request.model, config.model);
  assert.deepEqual(response, { text: '', reasoning: null, finishReason: null, completionTokens: null });

  fetchMock.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(callModel(args), /HTTP 503: unavailable/);
  fetchMock.mock.mockImplementation(async () => { throw new Error('network failed'); });
  await assert.rejects(callModel(args), /network failed/);
  await assert.rejects(getModelDigest(config), /network failed/);
});
