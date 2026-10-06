import { parseMeetingAnalysis } from './analysis.schema.js';
import {
  FAKE_ANALYZER_MODEL,
  FakeMeetingAnalyzer,
} from './fake-meeting-analyzer.js';

const input = {
  title: 'Sprint planning',
  notes: 'We planned the sprint.',
  meetingDate: new Date('2026-10-05T09:00:00.000Z'),
};

describe('FakeMeetingAnalyzer', () => {
  it('returns the same schema-valid analysis for the same input', async () => {
    const analyzer = new FakeMeetingAnalyzer();

    const first = await analyzer.analyze(input);
    const second = await analyzer.analyze(input);

    expect(first).toEqual(second);
    expect(first.model).toBe(FAKE_ANALYZER_MODEL);
    expect(() => parseMeetingAnalysis(first.output)).not.toThrow();
  });

  it('returns a configured output verbatim and records its calls', async () => {
    const analyzer = new FakeMeetingAnalyzer();
    analyzer.setOutput({ not: 'an analysis' });

    const result = await analyzer.analyze(input);

    expect(result.output).toEqual({ not: 'an analysis' });
    expect(analyzer.calls).toEqual([input]);
  });

  it('rejects with a configured error', async () => {
    const analyzer = new FakeMeetingAnalyzer();
    analyzer.failWith(new Error('boom'));

    await expect(analyzer.analyze(input)).rejects.toThrow('boom');
  });
});
