import assert from 'node:assert/strict';
import test from 'node:test';
import { callModel, callModelAttempt, getModelDigest } from '../src/harness/provider.mjs';

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
    promptTokens: null, reasoningTokens: null, usage: { completion_tokens: 0 },
  });
});

test('provider errors propagate while missing response fields retain v2.5 defaults', async (t) => {
  const args = { ...config, prompt: 'test', temperature: 0, seed: 1, maxTokens: 64 };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  const { request, ...response } = await callModel(args);
  assert.equal(request.model, config.model);
  assert.deepEqual(response, {
    text: '', reasoning: null, finishReason: null, completionTokens: null,
    promptTokens: null, reasoningTokens: null, usage: null,
  });

  fetchMock.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(callModel(args), /HTTP 503: unavailable/);
  fetchMock.mock.mockImplementation(async () => { throw new Error('network failed'); });
  await assert.rejects(callModel(args), /network failed/);
  await assert.rejects(getModelDigest(config), /network failed/);
});

test('token normalization preserves explicit usage, zero, null, and unsupported details', async (t) => {
  const cases = [
    [undefined, null, null, null],
    [null, null, null, null],
    [{ prompt_tokens: null, completion_tokens: null, completion_tokens_details: null }, null, null, null],
    [{ prompt_tokens: 0, completion_tokens: 0, completion_tokens_details: { reasoning_tokens: 0 } }, 0, 0, 0],
    [{ prompt_tokens: 12, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 3 }, extra: 9 }, 12, 5, 3],
    [{ total_tokens: 20, completion_tokens: 5, reasoning_tokens: 4 }, null, 5, null],
    [{ prompt_tokens: '12', completion_tokens_details: { reasoning_tokens: -1 } }, '12', null, -1],
  ];
  const fetchMock = t.mock.method(globalThis, 'fetch');
  for (const [usage, promptTokens, completionTokens, reasoningTokens] of cases) {
    fetchMock.mock.mockImplementation(async () => Response.json({ usage }));
    const response = await callModel({ ...config, prompt: 'test', temperature: 0, seed: 1, maxTokens: 64 });
    assert.deepEqual(response.usage, usage ?? null);
    assert.deepEqual([response.promptTokens, response.completionTokens, response.reasoningTokens],
      [promptTokens, completionTokens, reasoningTokens]);
  }
});

test('attempt timing includes response reading and normalization, including failed calls', async (t) => {
  let clock = 100;
  const args = { ...config, prompt: 'test', temperature: 0, seed: 1, maxTokens: 64 };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    clock += 4;
    return {
      ok: true,
      json: async () => {
        clock += 6;
        return { choices: [{ message: { get content() { clock += 2; return ' Hi '; } } }] };
      },
    };
  });
  const result = await callModelAttempt(args, () => clock);
  assert.equal(result.elapsedMs, 12);
  assert.equal(result.response.text, 'Hi');
  assert.equal(result.error, undefined);
  for (const scenario of ['http', 'network', 'json', 'normalization']) {
    fetchMock.mock.mockImplementation(async () => {
      clock += 3;
      if (scenario === 'network') throw new Error('network unavailable');
      return {
        ok: scenario !== 'http', status: 503,
        text: async () => { clock += 7; return 'unavailable'; },
        json: async () => {
          clock += 7;
          if (scenario === 'json') throw new Error('invalid JSON');
          return { choices: [{ message: { content: {} } }] };
        },
      };
    });
    const failed = await callModelAttempt(args, () => clock);
    assert.equal(failed.elapsedMs, scenario === 'network' ? 3 : 10);
    assert.equal(typeof failed.error, 'string');
    assert.equal(failed.response, undefined);
  }
});
