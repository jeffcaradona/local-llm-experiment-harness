import { performance } from 'node:perf_hooks';

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
  const usage = data.usage ?? null;
  const completionTokens = usage?.completion_tokens ?? null;
  const promptTokens = usage?.prompt_tokens ?? null;
  // Support this explicit field only; reasoning word counts are not telemetry.
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? null;
  return { request: body, text, reasoning, finishReason, completionTokens, promptTokens, reasoningTokens, usage };
}

// Keep timing and recoverable errors at the provider boundary. Evaluation and
// persistence happen outside this catch so their failures remain fatal.
export async function callModelAttempt(config, now = () => performance.now()) {
  const started = now();
  try {
    const response = await callModel(config);
    return { response, elapsedMs: now() - started };
  } catch (err) {
    return { error: err.message, elapsedMs: now() - started };
  }
}
