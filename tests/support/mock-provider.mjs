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
  const mixed = process.env.HARNESS_TEST_SCENARIO === 'mixed';
  if (mixed && request.seed === 7) return new Response('Mock failure', { status: 500 });
  if (mixed && request.seed === 8) return Response.json({});

  return Response.json({
    choices: [{
      message: {
        content: mixed && request.seed === 6 ? 'Hello' : '  Hello\tthere!\n',
        reasoning: 'Count two words',
      },
      finish_reason: mixed && request.seed === 5 ? 'length' : 'stop',
    }],
    usage: { prompt_tokens: 12, completion_tokens: 5 },
  });
};
