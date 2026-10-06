import { createTestApp, resetState, TestApp, UNKNOWN_ID } from './test-app.js';

describe('Action items API (e2e)', () => {
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

  /** Creates a meeting and analyzes it so it holds one AI-proposed action item. */
  async function meetingWithProposal() {
    ctx.analyzer.setOutput({
      summary: 'Launch planning.',
      decisions: [],
      openQuestions: [],
      followUpRequired: false,
      followUpDate: null,
      actionItems: [
        {
          task: 'Draft the launch checklist',
          owner: 'Aylin',
          deadline: '2026-10-12',
          priority: 'HIGH',
        },
      ],
    });
    const meeting = await ctx
      .http()
      .post('/api/meetings')
      .send({ title: 'Launch sync', notes: 'Aylin drafts the checklist.' })
      .expect(201);
    const analyzed = await ctx
      .http()
      .post(`/api/meetings/${meeting.body.id}/analyze`)
      .expect(200);
    return {
      meetingId: meeting.body.id as string,
      proposal: analyzed.body.actionItems[0],
    };
  }

  describe('PATCH /api/action-items/:id (manual override)', () => {
    it('lets a human override every field of an AI proposal', async () => {
      const { meetingId, proposal } = await meetingWithProposal();
      expect(proposal).toMatchObject({ source: 'AI', humanReviewed: false });

      const response = await ctx
        .http()
        .patch(`/api/action-items/${proposal.id}`)
        .send({
          task: '  Draft and circulate the launch checklist ',
          owner: 'Deniz',
          deadline: '2026-11-03',
          priority: 'LOW',
          status: 'IN_PROGRESS',
        })
        .expect(200);

      const expected = {
        id: proposal.id,
        meetingId,
        task: 'Draft and circulate the launch checklist',
        owner: 'Deniz',
        deadline: '2026-11-03',
        priority: 'LOW',
        status: 'IN_PROGRESS',
        source: 'AI',
        humanReviewed: true,
      };
      expect(response.body).toMatchObject(expected);

      const read = await ctx
        .http()
        .get(`/api/meetings/${meetingId}`)
        .expect(200);
      expect(read.body.actionItems).toEqual([response.body]);

      const stored = await ctx.prisma.actionItem.findUniqueOrThrow({
        where: { id: proposal.id },
      });
      expect(stored).toMatchObject({
        ...expected,
        deadline: new Date('2026-11-03T00:00:00.000Z'),
      });
    });

    it('changes only the fields that were sent', async () => {
      const { proposal } = await meetingWithProposal();

      const response = await ctx
        .http()
        .patch(`/api/action-items/${proposal.id}`)
        .send({ status: 'DONE' })
        .expect(200);

      expect(response.body).toEqual({
        ...proposal,
        status: 'DONE',
        humanReviewed: true,
      });
    });

    it('clears owner and deadline when they are set to null', async () => {
      const { proposal } = await meetingWithProposal();

      const response = await ctx
        .http()
        .patch(`/api/action-items/${proposal.id}`)
        .send({ owner: null, deadline: null })
        .expect(200);

      expect(response.body).toMatchObject({ owner: null, deadline: null });
      const stored = await ctx.prisma.actionItem.findUniqueOrThrow({
        where: { id: proposal.id },
      });
      expect(stored).toMatchObject({ owner: null, deadline: null });
    });

    it.each<[string, Record<string, unknown>]>([
      ['an empty body', {}],
      ['an unknown status', { status: 'BLOCKED' }],
      ['an unknown priority', { priority: 'URGENT' }],
      ['a null status', { status: null }],
      ['a null task', { task: null }],
      ['a blank task', { task: '   ' }],
      ['a blank owner', { owner: '  ' }],
      ['a datetime deadline', { deadline: '2026-11-03T10:00:00Z' }],
      ['an impossible deadline', { deadline: '2026-02-30' }],
      ['a field that is not editable', { source: 'HUMAN' }],
      ['a change of meeting', { meetingId: UNKNOWN_ID }],
    ])('rejects %s and leaves the item unchanged', async (_label, body) => {
      const { proposal } = await meetingWithProposal();
      const before = await ctx.prisma.actionItem.findUniqueOrThrow({
        where: { id: proposal.id },
      });

      await ctx
        .http()
        .patch(`/api/action-items/${proposal.id}`)
        .send(body)
        .expect(400);

      const after = await ctx.prisma.actionItem.findUniqueOrThrow({
        where: { id: proposal.id },
      });
      expect(after).toEqual(before);
    });

    it('returns 404 for an unknown action item', async () => {
      await ctx
        .http()
        .patch(`/api/action-items/${UNKNOWN_ID}`)
        .send({ status: 'DONE' })
        .expect(404);
    });
  });

  describe('POST /api/meetings/:id/action-items (human creation)', () => {
    it('creates a human-owned item with defaults', async () => {
      const { meetingId } = await meetingWithProposal();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/action-items`)
        .send({ task: 'Order catering' })
        .expect(201);

      expect(response.body).toMatchObject({
        meetingId,
        task: 'Order catering',
        owner: null,
        deadline: null,
        priority: 'MEDIUM',
        status: 'OPEN',
        source: 'HUMAN',
        humanReviewed: true,
      });
      expect(await ctx.prisma.actionItem.count({ where: { meetingId } })).toBe(
        2,
      );
    });

    it('creates an item with every field set', async () => {
      const { meetingId } = await meetingWithProposal();

      const response = await ctx
        .http()
        .post(`/api/meetings/${meetingId}/action-items`)
        .send({
          task: 'Order catering',
          owner: 'Mert',
          deadline: '2026-11-20',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        owner: 'Mert',
        deadline: '2026-11-20',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
      });
    });

    it.each<[string, Record<string, unknown>]>([
      ['a missing task', { owner: 'Mert' }],
      ['a blank task', { task: ' ' }],
      [
        'an invalid deadline',
        { task: 'Order catering', deadline: '20.11.2026' },
      ],
      ['an unknown property', { task: 'Order catering', source: 'AI' }],
    ])('rejects %s', async (_label, body) => {
      const { meetingId } = await meetingWithProposal();

      await ctx
        .http()
        .post(`/api/meetings/${meetingId}/action-items`)
        .send(body)
        .expect(400);

      expect(await ctx.prisma.actionItem.count({ where: { meetingId } })).toBe(
        1,
      );
    });

    it('returns 404 for an unknown meeting', async () => {
      await ctx
        .http()
        .post(`/api/meetings/${UNKNOWN_ID}/action-items`)
        .send({ task: 'Order catering' })
        .expect(404);
    });
  });

  describe('DELETE /api/action-items/:id', () => {
    it('deletes the item', async () => {
      const { meetingId, proposal } = await meetingWithProposal();

      await ctx.http().delete(`/api/action-items/${proposal.id}`).expect(204);

      expect(await ctx.prisma.actionItem.count({ where: { meetingId } })).toBe(
        0,
      );
      await ctx.http().delete(`/api/action-items/${proposal.id}`).expect(404);
    });
  });
});
