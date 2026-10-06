import Anthropic from '@anthropic-ai/sdk';
import { MalformedAnalysisError } from './analysis.schema.js';
import {
  AnthropicMeetingAnalyzer,
  DEFAULT_ANTHROPIC_MODEL,
} from './anthropic-meeting-analyzer.js';
import {
  AnalyzerRequestError,
  AnalyzerUnavailableError,
} from './meeting-analyzer.js';

// These tests never reach the network: the SDK client is replaced by a stub.

const input = {
  title: 'Launch sync',
  notes: 'Aylin will draft the checklist by Friday.',
  meetingDate: new Date('2026-10-05T14:30:00.000Z'),
};

const analysis = {
  summary: 'Launch planning.',
  decisions: [],
  openQuestions: [],
  followUpRequired: false,
  followUpDate: null,
  actionItems: [
    {
      task: 'Draft the checklist',
      owner: 'Aylin',
      deadline: '2026-10-09',
      priority: 'MEDIUM',
    },
  ],
};

function stubClient(parse: (...args: any[]) => unknown) {
  const parseMock = vi.fn(parse);
  const client = { messages: { parse: parseMock } } as unknown as Anthropic;
  return { client, parseMock };
}

function respondWith(overrides: Record<string, unknown> = {}) {
  return () =>
    Promise.resolve({
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      parsed_output: analysis,
      ...overrides,
    });
}

describe('AnthropicMeetingAnalyzer', () => {
  it('requests a structured analysis of the notes and returns it', async () => {
    const { client, parseMock } = stubClient(respondWith());
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    const result = await analyzer.analyze(input);

    expect(result).toEqual({ model: 'claude-opus-5-5', output: analysis });
    expect(parseMock).toHaveBeenCalledOnce();

    const request = parseMock.mock.calls[0][0];
    expect(request.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(request.system).toContain('Never invent');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    expect(request.messages[0].content).toContain(input.notes);
    expect(request.messages[0].content).toContain('Meeting title: Launch sync');
    expect(request.messages[0].content).toContain('Meeting date: 2026-10-05');
  });

  it('constrains the response to the analysis schema with nullable owner and deadline', async () => {
    const { client, parseMock } = stubClient(respondWith());
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    await analyzer.analyze(input);

    const format = parseMock.mock.calls[0][0].output_config.format;
    expect(format.type).toBe('json_schema');
    expect(format.schema.additionalProperties).toBe(false);
    expect(format.schema.required).toEqual([
      'summary',
      'decisions',
      'openQuestions',
      'followUpRequired',
      'followUpDate',
      'actionItems',
    ]);
    const item = format.schema.properties.actionItems.items;
    expect(item.required).toEqual(['task', 'owner', 'deadline', 'priority']);
    // The exact encoding of "nullable" is up to the SDK helper.
    expect(JSON.stringify(item.properties.owner)).toContain('"null"');
    expect(JSON.stringify(item.properties.deadline)).toContain('"null"');
  });

  it('uses the configured model', async () => {
    const { client, parseMock } = stubClient(respondWith());
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key', model: 'claude-sonnet-5-5' },
      client,
    );

    await analyzer.analyze(input);

    expect(parseMock.mock.calls[0][0].model).toBe('claude-sonnet-5-5');
  });

  it.each([undefined, '', '   '])(
    'is unavailable when the API key is %j',
    async (apiKey) => {
      const analyzer = new AnthropicMeetingAnalyzer({ apiKey });

      await expect(analyzer.analyze(input)).rejects.toThrow(
        AnalyzerUnavailableError,
      );
    },
  );

  it('fails when Claude refuses', async () => {
    const { client } = stubClient(
      respondWith({ stop_reason: 'refusal', parsed_output: null }),
    );
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    await expect(analyzer.analyze(input)).rejects.toThrow(AnalyzerRequestError);
  });

  it('fails when the response is cut off at max_tokens', async () => {
    const { client } = stubClient(respondWith({ stop_reason: 'max_tokens' }));
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    await expect(analyzer.analyze(input)).rejects.toThrow(AnalyzerRequestError);
  });

  it('reports a response without structured output as malformed', async () => {
    const { client } = stubClient(respondWith({ parsed_output: null }));
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    await expect(analyzer.analyze(input)).rejects.toThrow(
      MalformedAnalysisError,
    );
  });

  it('reports an SDK parse failure as malformed', async () => {
    const { client } = stubClient(() =>
      Promise.reject(
        new Anthropic.AnthropicError(
          'Failed to parse structured output: bad json',
        ),
      ),
    );
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    await expect(analyzer.analyze(input)).rejects.toThrow(
      MalformedAnalysisError,
    );
  });

  it('treats a rejected API key as unavailable without echoing the SDK message', async () => {
    const { client } = stubClient(() =>
      Promise.reject(
        new Anthropic.AuthenticationError(
          401,
          undefined,
          'invalid x-api-key: test-key',
          new Headers(),
        ),
      ),
    );
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    const error = await analyzer.analyze(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnalyzerUnavailableError);
    expect((error as Error).message).not.toContain('test-key');
  });

  it.each([
    [
      'a rate limit',
      new Anthropic.RateLimitError(
        429,
        undefined,
        'rate limited',
        new Headers(),
      ),
    ],
    [
      'a server error',
      new Anthropic.InternalServerError(
        500,
        undefined,
        'overloaded',
        new Headers(),
      ),
    ],
    [
      'a connection error',
      new Anthropic.APIConnectionError({ message: 'ECONNRESET' }),
    ],
    ['an unexpected error', new TypeError('fetch failed')],
  ])('maps %s to a request error', async (_label, sdkError) => {
    const { client } = stubClient(() => Promise.reject(sdkError));
    const analyzer = new AnthropicMeetingAnalyzer(
      { apiKey: 'test-key' },
      client,
    );

    await expect(analyzer.analyze(input)).rejects.toThrow(AnalyzerRequestError);
  });
});
