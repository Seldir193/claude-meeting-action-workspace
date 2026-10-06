/**
 * Mirrors the JSON the backend returns. Timestamps arrive as ISO strings.
 * Calendar dates (YYYY-MM-DD) are parsed by DatePipe as local midnight, so format them without a
 * timezone argument; passing 'UTC' shifts them to the previous day east of UTC.
 */

export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type ActionItemPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type ActionItemSource = 'AI' | 'HUMAN';

export interface MeetingListItem {
  id: string;
  title: string;
  createdAt: string;
  analyzedAt: string | null;
}

export interface MeetingAnalysis {
  id: string;
  summary: string;
  decisions: string[];
  openQuestions: string[];
  followUpRequired: boolean;
  /** Calendar date, YYYY-MM-DD. */
  followUpDate: string | null;
  model: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  task: string;
  owner: string | null;
  /** Calendar date, YYYY-MM-DD. */
  deadline: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  source: ActionItemSource;
  humanReviewed: boolean;
  createdAt: string;
}

export interface MeetingDetail extends MeetingListItem {
  notes: string;
  analysis: MeetingAnalysis | null;
  actionItems: ActionItem[];
}

export interface CreateMeetingInput {
  title: string;
  notes: string;
}

/** The only action item fields a human may write; the API rejects anything else. */
export interface ActionItemInput {
  task: string;
  owner: string | null;
  deadline: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
}

export const STATUSES: readonly ActionItemStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE'];
export const PRIORITIES: readonly ActionItemPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

export const STATUS_LABELS: Record<ActionItemStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
};

export const PRIORITY_LABELS: Record<ActionItemPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

/** Who stands behind an action item: Claude alone, a human, or Claude plus a human review. */
export type Provenance = 'AI_PROPOSAL' | 'HUMAN_REVIEWED' | 'HUMAN_CREATED';

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  AI_PROPOSAL: 'AI proposal',
  HUMAN_REVIEWED: 'Human-reviewed',
  HUMAN_CREATED: 'Human-created',
};

export function provenanceOf(item: ActionItem): Provenance {
  if (item.source === 'HUMAN') {
    return 'HUMAN_CREATED';
  }
  return item.humanReviewed ? 'HUMAN_REVIEWED' : 'AI_PROPOSAL';
}
