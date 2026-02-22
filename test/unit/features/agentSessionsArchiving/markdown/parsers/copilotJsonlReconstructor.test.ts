import { describe, it, expect } from 'vitest';
import { reconstructSessionFromJsonl } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/copilotJsonlReconstructor';

describe('reconstructSessionFromJsonl', () => {
  function reconstruct(content: string): any {
    return reconstructSessionFromJsonl(content);
  }
  it('should reconstruct a session from a single initialize line', () => {
    const jsonl = JSON.stringify({
      kind: 0,
      v: {
        requests: [
          {
            message: { text: 'Hello' },
            response: [{ value: 'Hi there!' }],
          },
        ],
      },
    });

    const result = reconstruct(jsonl);

    expect(result).toEqual({
      requests: [
        {
          message: { text: 'Hello' },
          response: [{ value: 'Hi there!' }],
        },
      ],
    });
  });

  it('should apply set operations (kind 1) to the session', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [], customTitle: 'Old Title' },
      }),
      JSON.stringify({
        kind: 1,
        k: ['customTitle'],
        v: 'New Title',
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.customTitle).toBe('New Title');
  });

  it('should apply append operations (kind 2) to arrays', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [] },
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{ message: { text: 'First question' }, response: [] }],
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].message.text).toBe('First question');
  });

  it('should apply nested set operations using key path', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: {
          requests: [{ message: { text: 'Q1' }, response: [] }],
        },
      }),
      JSON.stringify({
        kind: 1,
        k: ['requests', 0, 'response'],
        v: [{ value: 'Answer 1' }],
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.requests[0].response).toEqual([{ value: 'Answer 1' }]);
  });

  it('should apply nested append operations', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: {
          requests: [
            {
              message: { text: 'Q1' },
              response: [{ value: 'partial' }],
            },
          ],
        },
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [{ kind: 'toolInvocationSerialized', toolId: 'readFile' }],
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.requests[0].response).toHaveLength(2);
    expect(result.requests[0].response[0].value).toBe('partial');
    expect(result.requests[0].response[1].toolId).toBe('readFile');
  });

  it('should handle multiple sequential operations', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [] },
      }),
      // Append first request
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{ message: { text: 'Q1' }, response: [] }],
      }),
      // Append response to first request
      JSON.stringify({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [{ value: 'A1' }],
      }),
      // Append second request
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{ message: { text: 'Q2' }, response: [] }],
      }),
      // Set title
      JSON.stringify({
        kind: 1,
        k: ['customTitle'],
        v: 'My Session',
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.requests).toHaveLength(2);
    expect(result.requests[0].message.text).toBe('Q1');
    expect(result.requests[0].response).toEqual([{ value: 'A1' }]);
    expect(result.requests[1].message.text).toBe('Q2');
    expect(result.customTitle).toBe('My Session');
  });

  it('should return empty object when content is empty', () => {
    const result = reconstruct('');

    expect(result).toEqual({});
  });

  it('should return empty object when no initialize line is present', () => {
    const lines = [JSON.stringify({ kind: 1, k: ['customTitle'], v: 'Title' })].join(
      '\n'
    );

    const result = reconstruct(lines);

    expect(result).toEqual({});
  });

  it('should skip malformed lines gracefully', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [{ message: { text: 'Q1' }, response: [] }] },
      }),
      'not valid json',
      JSON.stringify({
        kind: 1,
        k: ['customTitle'],
        v: 'Title',
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.requests).toHaveLength(1);
    expect(result.customTitle).toBe('Title');
  });

  it('should skip blank lines', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [] },
      }),
      '',
      '   ',
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{ message: { text: 'Q1' }, response: [] }],
      }),
    ].join('\n');

    const result = reconstruct(lines);

    expect(result.requests).toHaveLength(1);
  });
});
