// Preserve the v2.5 provider protocol independently of any workload's rules.
export async function getModelDigest({ baseUrl, model }) {
  const apiBase = baseUrl.replace(/\/v1\/?$/, '');
  const res = await fetch(`${apiBase}/api/tags`);
  if (!res.ok) return null;
  const data = await res.json();
  const match = data.models?.find((m) => m.name === model || m.model === model);
  return match?.digest ?? null;
}

export async function callModel({ baseUrl, model, timeoutMs, prompt, temperature, seed, maxTokens }) {
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    temperature,
    seed,
    max_tokens: maxTokens,
    options: { num_predict: maxTokens },
  };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
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
