import { z } from 'zod';

export const ACTION_ITEM_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

/**
 * Wire contract for the structured analysis. It is sent to Claude as the
 * required output format and re-checked on whatever any analyzer returns.
 * Owner, deadline and follow-up date are nullable so missing data stays null.
 */
export const meetingAnalysisSchema = z.strictObject({
  summary: z
    .string()
    .describe('Concise summary of the meeting in two to four sentences.'),
  decisions: z
    .array(z.string())
    .describe('Decisions explicitly made in the meeting. Empty if none.'),
  openQuestions: z
    .array(z.string())
    .describe('Questions raised but left unresolved. Empty if none.'),
  followUpRequired: z
    .boolean()
    .describe(
      'True only if the notes call for a follow-up meeting or check-in.',
    ),
  followUpDate: z.iso
    .date()
    .nullable()
    .describe('Follow-up date as YYYY-MM-DD, or null if the notes give none.'),
  actionItems: z.array(
    z.strictObject({
      task: z.string().describe('What needs to be done.'),
      owner: z
        .string()
        .nullable()
        .describe('Person responsible as named in the notes, or null.'),
      deadline: z.iso
        .date()
        .nullable()
        .describe('Deadline as YYYY-MM-DD, or null if the notes give none.'),
      priority: z.enum(ACTION_ITEM_PRIORITIES),
    }),
  ),
});

export type MeetingAnalysisResult = z.infer<typeof meetingAnalysisSchema>;

export class MalformedAnalysisError extends Error {
  override readonly name = 'MalformedAnalysisError';

  constructor(readonly issues: string[]) {
    super(`Malformed meeting analysis: ${issues.join('; ')}`);
  }
}

/**
 * Validates and normalizes raw analyzer output. Throws MalformedAnalysisError
 * for anything that does not fully satisfy the contract; it never returns a
 * partially valid result.
 */
export function parseMeetingAnalysis(raw: unknown): MeetingAnalysisResult {
  const parsed = meetingAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MalformedAnalysisError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    );
  }

  const result = parsed.data;
  const issues: string[] = [];

  const summary = result.summary.trim();
  if (summary === '') {
    issues.push('summary: must not be blank');
  }

  const actionItems = result.actionItems.map((item, index) => {
    const task = item.task.trim();
    if (task === '') {
      issues.push(`actionItems.${index}.task: must not be blank`);
    }
    // A blank owner carries no information, so it is stored as "no owner".
    const owner = item.owner?.trim() || null;
    return { ...item, task, owner };
  });

  if (issues.length > 0) {
    throw new MalformedAnalysisError(issues);
  }

  return {
    ...result,
    summary,
    decisions: compact(result.decisions),
    openQuestions: compact(result.openQuestions),
    actionItems,
  };
}

function compact(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value !== '');
}
