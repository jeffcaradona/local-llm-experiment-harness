import assert from 'node:assert/strict';
import test from 'node:test';
import { greetingWorkload as workload } from '../workloads/greeting/workload.mjs';

test('greeting rendering preserves spelling limits and literal template text', () => {
  const template = '{spelledNumber}: {target}, {target}! {unknown}';
  for (const [target, spelling] of [[0, 'zero'], [20, 'twenty'], [21, '21'], [-1, '-1']]) {
    assert.equal(workload.promptFor(template, target), `${spelling}: ${target}, ${target}! {unknown}`);
  }
  assert.equal(workload.promptFor('No placeholders here.', 2), 'No placeholders here.');
});

test('greeting evaluation counts whitespace words without interpreting punctuation or reasoning', () => {
  const cases = [
    { text: '  Hello,\tworld!\n', target: 2, wordCount: 2, pass: true },
    { text: 'hello-world', target: 2, wordCount: 1, pass: false },
    { text: ' \n\t', target: 0, wordCount: 0, pass: true },
    { text: '', target: 2, wordCount: 0, pass: false },
  ];
  for (const { text, target, wordCount, pass } of cases) {
    const response = { text, reasoning: 'one two three', finishReason: 'length' };
    assert.deepEqual(workload.evaluate(response, target), {
      reasoningLength: 3, wordCount, pass, truncated: true,
    });
    assert.equal(response.text, text, 'evaluation must not change the provider response');
  }
  for (const [reasoning, length] of [[null, null], ['', null], ['  ', 0]]) {
    assert.deepEqual(workload.evaluate({ text: 'Hello there', reasoning, finishReason: null }, 2), {
      reasoningLength: length, wordCount: 2, pass: true, truncated: false,
    });
  }
});

test('greeting summary includes failed calls and excludes unavailable reasoning counts', () => {
  const rows = [
    { pass: true, truncated: true, reasoningLength: 2 },
    { pass: false, truncated: false, reasoningLength: 3 },
    { pass: false, truncated: false, reasoningLength: null },
    { pass: false, truncated: false, error: 'HTTP 500' },
  ];
  assert.deepEqual(workload.summarize(rows, 4), {
    passCount: 1, truncatedCount: 1, avgReasoningLength: 3, runs: 4, passRate: 0.25,
  });
  assert.deepEqual(workload.summarize([rows[3]], 1), {
    passCount: 0, truncatedCount: 0, avgReasoningLength: null, runs: 1, passRate: 0,
  });
});
