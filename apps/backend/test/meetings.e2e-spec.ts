import { createTestApp, resetState, TestApp, UNKNOWN_ID } from './test-app.js';

describe('Meetings API (e2e)', () => {
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

  describe('POST /api/meetings', () => {
    it('creates and persists a meeting that has not been analyzed yet', async () => {
      const response = await ctx
        .http()
        .post('/api/meetings')
        .send({
          title: '  Q4 launch sync  ',
          notes: 'Aylin drafts the checklist.',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Q4 launch sync',
        notes: 'Aylin drafts the checklist.',
        analyzedAt: null,
        analysis: null,
        actionItems: [],
      });
      expect(response.body.id).toEqual(expect.any(String));
      expect(Date.parse(response.body.createdAt)).not.toBeNaN();

      const stored = await ctx.prisma.meeting.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: response.body.id,
        title: 'Q4 launch sync',
        notes: 'Aylin drafts the checklist.',
        analyzedAt: null,
      });
      expect(ctx.analyzer.calls).toHaveLength(0);
    });

    it.each<[string, Record<string, unknown>]>([
      ['a missing title', { notes: 'Some notes' }],
      ['a missing notes field', { title: 'Sync' }],
      ['a blank title', { title: '   ', notes: 'Some notes' }],
      ['blank notes', { title: 'Sync', notes: '  ' }],
      ['a non-string title', { title: 42, notes: 'Some notes' }],
      [
        'a title over 200 characters',
        { title: 'x'.repeat(201), notes: 'Some notes' },
      ],
      [
        'an unknown property',
        { title: 'Sync', notes: 'Some notes', analyzedAt: '2026-01-01' },
      ],
    ])('rejects %s without persisting anything', async (_label, body) => {
      await ctx.http().post('/api/meetings').send(body).expect(400);

      expect(await ctx.prisma.meeting.count()).toBe(0);
    });
  });

  describe('GET /api/meetings', () => {
    it('lists meetings newest first, without their notes', async () => {
      await ctx.prisma.meeting.create({
        data: {
          title: 'Older',
          notes: 'n',
          createdAt: new Date('2026-10-01T09:00:00Z'),
        },
      });
      await ctx.prisma.meeting.create({
        data: {
          title: 'Newer',
          notes: 'n',
          createdAt: new Date('2026-10-02T09:00:00Z'),
        },
      });

      const response = await ctx.http().get('/api/meetings').expect(200);

      expect(response.body.map((m: { title: string }) => m.title)).toEqual([
        'Newer',
        'Older',
      ]);
      expect(Object.keys(response.body[0]).sort()).toEqual([
        'analyzedAt',
        'createdAt',
        'id',
        'title',
      ]);
    });

    it('returns an empty list when there are no meetings', async () => {
      const response = await ctx.http().get('/api/meetings').expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/meetings/:id', () => {
    it('returns the meeting with its notes', async () => {
      const created = await ctx
        .http()
        .post('/api/meetings')
        .send({ title: 'Sync', notes: 'Some notes' })
        .expect(201);

      const response = await ctx
        .http()
        .get(`/api/meetings/${created.body.id}`)
        .expect(200);

      expect(response.body).toEqual(created.body);
    });

    it('returns 404 for an unknown meeting', async () => {
      await ctx.http().get(`/api/meetings/${UNKNOWN_ID}`).expect(404);
    });

    it('returns 400 for a malformed id', async () => {
      await ctx.http().get('/api/meetings/not-a-uuid').expect(400);
    });
  });
});
