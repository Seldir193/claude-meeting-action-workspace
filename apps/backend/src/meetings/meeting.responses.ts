import { toDateOnly } from '../common/date-only.js';
import type {
  ActionItem,
  Meeting,
  MeetingAnalysis,
} from '../generated/prisma/client.js';

export interface MeetingListItem {
  id: string;
  title: string;
  createdAt: Date;
  analyzedAt: Date | null;
}

export interface MeetingAnalysisResponse {
  id: string;
  summary: string;
  decisions: string[];
  openQuestions: string[];
  followUpRequired: boolean;
  followUpDate: string | null;
  model: string;
}

export interface ActionItemResponse {
  id: string;
  meetingId: string;
  task: string;
  owner: string | null;
  deadline: string | null;
  priority: ActionItem['priority'];
  status: ActionItem['status'];
  source: ActionItem['source'];
  humanReviewed: boolean;
  createdAt: Date;
}

export interface MeetingDetail extends MeetingListItem {
  notes: string;
  analysis: MeetingAnalysisResponse | null;
  actionItems: ActionItemResponse[];
}

export function toActionItemResponse(item: ActionItem): ActionItemResponse {
  return { ...item, deadline: toDateOnly(item.deadline) };
}

export function toMeetingDetail(
  meeting: Meeting & {
    analysis: MeetingAnalysis | null;
    actionItems: ActionItem[];
  },
): MeetingDetail {
  const { analysis, actionItems, ...rest } = meeting;
  return {
    ...rest,
    analysis: analysis && {
      id: analysis.id,
      summary: analysis.summary,
      decisions: analysis.decisions,
      openQuestions: analysis.openQuestions,
      followUpRequired: analysis.followUpRequired,
      followUpDate: toDateOnly(analysis.followUpDate),
      model: analysis.model,
    },
    actionItems: actionItems.map(toActionItemResponse),
  };
}
