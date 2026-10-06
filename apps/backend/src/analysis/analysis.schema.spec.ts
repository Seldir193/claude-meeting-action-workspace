import {
  MalformedAnalysisError,
  MeetingAnalysisResult,
  parseMeetingAnalysis,
} from './analysis.schema.js';

function validAnalysis(): MeetingAnalysisResult {
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
        priority: 'LOW',
      },
    ],
  };
}

describe('parseMeetingAnalysis', () => {
  it('accepts a complete, valid analysis unchanged', () => {
    expect(parseMeetingAnalysis(validAnalysis())).toEqual(validAnalysis());
  });

  it('keeps a missing owner, deadline and follow-up date as null', () => {
    const result = parseMeetingAnalysis({
      ...validAnalysis(),
      followUpRequired: false,
      followUpDate: null,
    });

    expect(result.followUpDate).toBeNull();
    expect(result.actionItems[1]).toMatchObject({
      owner: null,
      deadline: null,
    });
  });

  it('accepts an analysis with no decisions, questions or action items', () => {
    const result = parseMeetingAnalysis({
      ...validAnalysis(),
      decisions: [],
      openQuestions: [],
      actionItems: [],
    });

    expect(result.actionItems).toEqual([]);
  });

  it('trims text, drops blank list entries and turns a blank owner into null', () => {
    const input = validAnalysis();
    input.summary = '  Summary with padding.  ';
    input.decisions = [' Ship it. ', '   '];
    input.actionItems[0].owner = '   ';
    input.actionItems[0].task = ' Draft the checklist ';

    const result = parseMeetingAnalysis(input);

    expect(result.summary).toBe('Summary with padding.');
    expect(result.decisions).toEqual(['Ship it.']);
    expect(result.actionItems[0]).toMatchObject({
      task: 'Draft the checklist',
      owner: null,
    });
  });

  const withActionItem = (item: unknown) => ({
    ...validAnalysis(),
    actionItems: [validAnalysis().actionItems[0], item],
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a plain string', 'Summary: all good'],
    ['an array', [validAnalysis()]],
    ['an empty object', {}],
    ['a missing summary', { ...validAnalysis(), summary: undefined }],
    ['a blank summary', { ...validAnalysis(), summary: '   ' }],
    [
      'a non-array decisions field',
      { ...validAnalysis(), decisions: 'Ship it' },
    ],
    ['a non-string decision', { ...validAnalysis(), decisions: [42] }],
    [
      'a non-boolean followUpRequired',
      { ...validAnalysis(), followUpRequired: 'yes' },
    ],
    ['a missing followUpDate', { ...validAnalysis(), followUpDate: undefined }],
    [
      'a free-text followUpDate',
      { ...validAnalysis(), followUpDate: 'next Friday' },
    ],
    [
      'an impossible followUpDate',
      { ...validAnalysis(), followUpDate: '2026-02-30' },
    ],
    ['missing actionItems', { ...validAnalysis(), actionItems: undefined }],
    ['an unexpected top-level field', { ...validAnalysis(), confidence: 0.9 }],
    [
      'an action item without a task',
      withActionItem({ owner: null, deadline: null, priority: 'LOW' }),
    ],
    [
      'an action item with a blank task',
      withActionItem({
        task: '  ',
        owner: null,
        deadline: null,
        priority: 'LOW',
      }),
    ],
    [
      'an action item with an omitted owner',
      withActionItem({ task: 'Do it', deadline: null, priority: 'LOW' }),
    ],
    [
      'an action item with an unknown priority',
      withActionItem({
        task: 'Do it',
        owner: null,
        deadline: null,
        priority: 'URGENT',
      }),
    ],
    [
      'an action item with a datetime deadline',
      withActionItem({
        task: 'Do it',
        owner: null,
        deadline: '2026-10-12T09:00:00Z',
        priority: 'LOW',
      }),
    ],
    [
      'an action item with an extra field',
      withActionItem({
        task: 'Do it',
        owner: null,
        deadline: null,
        priority: 'LOW',
        status: 'DONE',
      }),
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseMeetingAnalysis(raw)).toThrow(MalformedAnalysisError);
  });

  it('reports which fields were wrong', () => {
    try {
      parseMeetingAnalysis({
        ...validAnalysis(),
        summary: 7,
        followUpRequired: 'no',
      });
      expect.unreachable('expected a MalformedAnalysisError');
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedAnalysisError);
      const issues = (error as MalformedAnalysisError).issues.join('\n');
      expect(issues).toContain('summary');
      expect(issues).toContain('followUpRequired');
    }
  });
});
