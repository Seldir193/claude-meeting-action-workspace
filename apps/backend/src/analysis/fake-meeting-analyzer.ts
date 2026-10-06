import { MeetingAnalysisResult } from './analysis.schema.js';
import {
  MeetingAnalyzer,
  MeetingAnalyzerInput,
  MeetingAnalyzerOutput,
} from './meeting-analyzer.js';

export const FAKE_ANALYZER_MODEL = 'fake-meeting-analyzer';

/**
 * Deterministic analyzer for tests and key-less local development. It makes no
 * network calls. By default it returns a fixed, valid analysis; tests can swap
 * in any output, including malformed ones, or make it throw.
 */
export class FakeMeetingAnalyzer implements MeetingAnalyzer {
  readonly calls: MeetingAnalyzerInput[] = [];
  private output: unknown;
  private error?: Error;

  constructor(output?: unknown) {
    this.output = output;
  }

  setOutput(output: unknown): void {
    this.output = output;
    this.error = undefined;
  }

  failWith(error: Error): void {
    this.error = error;
  }

  reset(): void {
    this.calls.length = 0;
    this.output = undefined;
    this.error = undefined;
  }

  analyze(input: MeetingAnalyzerInput): Promise<MeetingAnalyzerOutput> {
    this.calls.push(input);
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve({
      model: FAKE_ANALYZER_MODEL,
      output: this.output === undefined ? defaultAnalysis(input) : this.output,
    });
  }
}

function defaultAnalysis(input: MeetingAnalyzerInput): MeetingAnalysisResult {
  return {
    summary: `Fake analysis of "${input.title}".`,
    decisions: ['Fake decision: proceed with the plan discussed.'],
    openQuestions: ['Fake open question: who signs off on the result?'],
    followUpRequired: false,
    followUpDate: null,
    actionItems: [
      {
        task: 'Fake action item: review the meeting notes.',
        owner: null,
        deadline: null,
        priority: 'MEDIUM',
      },
    ],
  };
}
