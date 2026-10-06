export const MEETING_ANALYZER = Symbol('MEETING_ANALYZER');

export interface MeetingAnalyzerInput {
  title: string;
  notes: string;
  /** Reference date for resolving relative deadlines such as "next Friday". */
  meetingDate: Date;
}

export interface MeetingAnalyzerOutput {
  /** Identifier of the model that produced the output. */
  model: string;
  /**
   * Raw structured output. Deliberately untyped: callers must run it through
   * `parseMeetingAnalysis` before trusting or persisting it.
   */
  output: unknown;
}

export interface MeetingAnalyzer {
  analyze(input: MeetingAnalyzerInput): Promise<MeetingAnalyzerOutput>;
}

/** The analyzer cannot be used at all, e.g. no API key is configured. */
export class AnalyzerUnavailableError extends Error {
  override readonly name = 'AnalyzerUnavailableError';
}

/** The analyzer was called but did not return a usable response. */
export class AnalyzerRequestError extends Error {
  override readonly name = 'AnalyzerRequestError';
}
