import { FAKE_ANALYZER_MODEL } from '../src/analysis/fake-meeting-analyzer.js';
import {
  AnalyzerRequestError,
  AnalyzerUnavailableError,
} from '../src/analysis/meeting-analyzer.js';
import { createTestApp, resetState, TestApp, UNKNOWN_ID } from './test-app.js';

const NOTES = [
  'Aylin drafts the launch checklist by 12 October, this is urgent.',
  'Someone needs to book the demo room.',
  'Decision: we launch on 1 December.',
  'Open: who covers support during launch week? Check in again on 19 October.',
].join('\n');

function analysisOutput() {
  return {
    summary: 'The team agreed on the Q4 launch plan.',
    decisions: ['Launch on 1 December.'],
    openQuestions: ['Who covers support during launch week?'],
    followUpRequired: true,
    followUpDate: '2026-10-19',
    actionItems: [
      {
        task: 'Draft the launch checklist',
        owner: 'Aylin',
        deadline: '2026-10-12',
        priority: 'HIGH',
      },
      {
        task: 'Book the demo room',
        owner: null,
        deadline: null,
        priority: 'MEDIUM',
      },
    ],
  };
}

describe('Meeting analysis (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function createMeeting(): Promise<string> {
    const response = await ctx
      .http()
      .post('/api/meetings')
      .send({ title: 'Q4 launch sync', notes: NOTES })
      .expect(201);
    return response.body.id;
  }

  async function storedState(meetingId: string) {
    const [meeting, analyses, actionItems] = await Promise.all([
      ctx.prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
      ctx.prisma.meetingAnalysis.findMany({ where: { meetingId } }),
      ctx.prisma.actionItem.findMany({
        where: { meetingId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { meeting, analyses, actionItems };
  }

  describe('orchestration', () => {
    it('sends the meeting to the analyzer and returns the stored proposal', async () => {
      ctx.analyzer.setOutput(analysisOutput());
      const meetingId = await createMeeting();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(ctx.analyzer.calls).toHaveLength(1);
      const { meeting } = await storedState(meetingId);
      expect(ctx.analyzer.calls[0]).toEqual({
        title: 'Q4 launch sync',
        notes: NOTES,
        meetingDate: meeting.createdAt,
      });

      expect(response.body.id).toBe(meetingId);
      expect(Date.parse(response.body.analyzedAt)).not.toBeNaN();
      expect(response.body.analysis).toEqual({
        id: expect.any(String),
        summary: 'The team agreed on the Q4 launch plan.',
        decisions: ['Launch on 1 December.'],
        openQuestions: ['Who covers support during launch week?'],
        followUpRequired: true,
        followUpDate: '2026-10-19',
        model: FAKE_ANALYZER_MODEL,
      });
      expect(response.body.actionItems).toHaveLength(2);
    });

    it('serves the stored analysis on later reads without calling the analyzer again', async () => {
      ctx.analyzer.setOutput(analysisOutput());
      const meetingId = await createMeeting();
      const analyzed = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      const read = await ctx
        .http()
        .get(`/api/meetings/${meetingId}`)
        .expect(200);

      expect(read.body).toEqual(analyzed.body);
      expect(ctx.analyzer.calls).toHaveLength(1);

      const list = await ctx.http().get('/api/meetings').expect(200);
      expect(list.body[0].analyzedAt).toBe(analyzed.body.analyzedAt);
    });

    it('returns 404 for an unknown meeting without calling the analyzer', async () => {
      await ctx.http().post(`/api/meetings/${UNKNOWN_ID}/analyze`).expect(404);

      expect(ctx.analyzer.calls).toHaveLength(0);
    });
  });

  describe('action item persistence', () => {
    it('stores each proposed action item as an open, unreviewed AI proposal', async () => {
      ctx.analyzer.setOutput(analysisOutput());
      const meetingId = await createMeeting();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(response.body.actionItems).toEqual([
        {
          id: expect.any(String),
          meetingId,
          task: 'Draft the launch checklist',
          owner: 'Aylin',
          deadline: '2026-10-12',
          priority: 'HIGH',
          status: 'OPEN',
          source: 'AI',
          humanReviewed: false,
          createdAt: expect.any(String),
        },
        {
          id: expect.any(String),
          meetingId,
          task: 'Book the demo room',
          owner: null,
          deadline: null,
          priority: 'MEDIUM',
          status: 'OPEN',
          source: 'AI',
          humanReviewed: false,
          createdAt: expect.any(String),
        },
      ]);

      const { actionItems } = await storedState(meetingId);
      expect(actionItems.map((item) => item.task)).toEqual([
        'Draft the launch checklist',
        'Book the demo room',
      ]);
    });

    it('keeps a missing owner, deadline and follow-up date as null in the database', async () => {
      ctx.analyzer.setOutput({
        ...analysisOutput(),
        followUpRequired: false,
        followUpDate: null,
      });
      const meetingId = await createMeeting();

      await ctx.http().post(`/api/meetings/${meetingId}/analyze`).expect(200);

      const { analyses, actionItems } = await storedState(meetingId);
      expect(analyses[0].followUpDate).toBeNull();
      expect(actionItems[1]).toMatchObject({ owner: null, deadline: null });
      expect(actionItems[0].deadline).toEqual(
        new Date('2026-10-12T00:00:00.000Z'),
      );
    });

    it('stores an analysis that proposes no action items', async () => {
      ctx.analyzer.setOutput({ ...analysisOutput(), actionItems: [] });
      const meetingId = await createMeeting();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(response.body.analysis.summary).toBe(
        'The team agreed on the Q4 launch plan.',
      );
      expect(response.body.actionItems).toEqual([]);
    });
  });

  describe('malformed analyzer output', () => {
    const withActionItems = (...items: unknown[]) => ({
      ...analysisOutput(),
      actionItems: items,
    });
    const validItem = analysisOutput().actionItems[0];

    it.each<[string, unknown]>([
      ['null', null],
      [
        'free text instead of structured output',
        'Summary: the meeting went well.',
      ],
      ['an empty object', {}],
      ['a missing summary', { ...analysisOutput(), summary: undefined }],
      ['a blank summary', { ...analysisOutput(), summary: '  ' }],
      [
        'decisions that are not a list',
        { ...analysisOutput(), decisions: 'Launch' },
      ],
      [
        'a non-boolean followUpRequired',
        { ...analysisOutput(), followUpRequired: 'yes' },
      ],
      [
        'a free-text follow-up date',
        { ...analysisOutput(), followUpDate: 'next Friday' },
      ],
      [
        'an impossible follow-up date',
        { ...analysisOutput(), followUpDate: '2026-02-30' },
      ],
      ['missing actionItems', { ...analysisOutput(), actionItems: undefined }],
      ['an unexpected extra field', { ...analysisOutput(), confidence: 0.9 }],
      [
        'one invalid action item after a valid one',
        withActionItems(validItem, { ...validItem, priority: 'URGENT' }),
      ],
      [
        'an action item with an omitted owner',
        withActionItems({ ...validItem, owner: undefined }),
      ],
      [
        'an action item with a free-text deadline',
        withActionItems({ ...validItem, deadline: 'Friday' }),
      ],
      [
        'an action item with a blank task',
        withActionItems({ ...validItem, task: ' ' }),
      ],
    ])('rejects %s and persists nothing', async (_label, output) => {
      ctx.analyzer.setOutput(output);
      const meetingId = await createMeeting();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(502);

      expect(response.body.message).toBe(
        'The AI analysis was malformed and was not saved.',
      );
      const { meeting, analyses, actionItems } = await storedState(meetingId);
      expect(analyses).toEqual([]);
      expect(actionItems).toEqual([]);
      expect(meeting.analyzedAt).toBeNull();
    });

    it('leaves a previous analysis and its action items untouched', async () => {
      ctx.analyzer.setOutput(analysisOutput());
      const meetingId = await createMeeting();
      await ctx.http().post(`/api/meetings/${meetingId}/analyze`).expect(200);
      const before = await storedState(meetingId);

      ctx.analyzer.setOutput({
        ...analysisOutput(),
        summary: 'A newer summary.',
        actionItems: [
          {
            task: 'New task',
            owner: 'Deniz',
            deadline: 'soon',
            priority: 'LOW',
          },
        ],
      });
      await ctx.http().post(`/api/meetings/${meetingId}/analyze`).expect(502);

      expect(await storedState(meetingId)).toEqual(before);
    });

    it('rolls the whole analysis back when an action item cannot be stored', async () => {
      // Passes validation, but PostgreSQL rejects NUL bytes in text, so the
      // insert fails after the analysis row was already written in the transaction.
      ctx.analyzer.setOutput({
        ...analysisOutput(),
        actionItems: [validItem, { ...validItem, task: 'Broken \u0000 task' }],
      });
      const meetingId = await createMeeting();

      await ctx.http().post(`/api/meetings/${meetingId}/analyze`).expect(500);

      const { meeting, analyses, actionItems } = await storedState(meetingId);
      expect(analyses).toEqual([]);
      expect(actionItems).toEqual([]);
      expect(meeting.analyzedAt).toBeNull();
    });
  });

  describe('analyzer failures', () => {
    it('returns 502 and persists nothing when the analyzer request fails', async () => {
      ctx.analyzer.failWith(
        new AnalyzerRequestError('Could not reach the Anthropic API.'),
      );
      const meetingId = await createMeeting();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(502);

      expect(response.body.message).toBe('Could not reach the Anthropic API.');
      const { meeting, analyses, actionItems } = await storedState(meetingId);
      expect(analyses).toEqual([]);
      expect(actionItems).toEqual([]);
      expect(meeting.analyzedAt).toBeNull();
    });

    it('returns 503 when the analyzer is not configured', async () => {
      ctx.analyzer.failWith(
        new AnalyzerUnavailableError(
          'ANTHROPIC_API_KEY is not configured on the backend.',
        ),
      );
      const meetingId = await createMeeting();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(503);

      expect(response.body.message).toBe(
        'ANTHROPIC_API_KEY is not configured on the backend.',
      );
      expect((await storedState(meetingId)).analyses).toEqual([]);
    });
  });

  describe('re-analysis', () => {
    it('replaces the analysis and untouched AI proposals but keeps human decisions', async () => {
      ctx.analyzer.setOutput(analysisOutput());
      const meetingId = await createMeeting();
      const first = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);
      const [checklist, demoRoom] = first.body.actionItems;

      // A human reassigns one proposal and adds an item of their own.
      await ctx
        .http()
        .patch(`/api/action-items/${checklist.id}`)
        .send({ owner: 'Deniz' })
        .expect(200);
      const manual = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/action-items`)
        .send({ task: 'Order catering' })
        .expect(201);

      ctx.analyzer.setOutput({
        ...analysisOutput(),
        summary: 'A second, different summary.',
        actionItems: [
          {
            task: 'Send the launch invite',
            owner: null,
            deadline: null,
            priority: 'LOW',
          },
        ],
      });
      const second = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(second.body.analysis.summary).toBe('A second, different summary.');
      expect((await storedState(meetingId)).analyses).toHaveLength(1);

      const items = second.body.actionItems as { id: string; task: string }[];
      expect(items.map((item) => item.task).sort()).toEqual([
        'Draft the launch checklist',
        'Order catering',
        'Send the launch invite',
      ]);
      expect(items.find((item) => item.id === checklist.id)).toMatchObject({
        owner: 'Deniz',
        source: 'AI',
        humanReviewed: true,
      });
      expect(items.find((item) => item.id === manual.body.id)).toMatchObject({
        source: 'HUMAN',
      });
      expect(items.some((item) => item.id === demoRoom.id)).toBe(false);
    });
  });
});
