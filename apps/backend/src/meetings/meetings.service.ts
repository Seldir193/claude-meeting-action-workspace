import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  MalformedAnalysisError,
  MeetingAnalysisResult,
  parseMeetingAnalysis,
} from '../analysis/analysis.schema.js';
import {
  AnalyzerRequestError,
  AnalyzerUnavailableError,
  MEETING_ANALYZER,
} from '../analysis/meeting-analyzer.js';
import type { MeetingAnalyzer } from '../analysis/meeting-analyzer.js';
import { fromDateOnly } from '../common/date-only.js';
import type { Meeting, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import {
  MeetingDetail,
  MeetingListItem,
  toMeetingDetail,
} from './meeting.responses.js';

const DETAIL_INCLUDE = {
  analysis: true,
  actionItems: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.MeetingInclude;

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEETING_ANALYZER) private readonly analyzer: MeetingAnalyzer,
  ) {}

  async create(dto: CreateMeetingDto): Promise<MeetingDetail> {
    const meeting = await this.prisma.meeting.create({
      data: { title: dto.title, notes: dto.notes },
      include: DETAIL_INCLUDE,
    });
    return toMeetingDetail(meeting);
  }

  findAll(): Promise<MeetingListItem[]> {
    return this.prisma.meeting.findMany({
      select: { id: true, title: true, createdAt: true, analyzedAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async findOne(id: string): Promise<MeetingDetail> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }
    return toMeetingDetail(meeting);
  }

  /**
   * Asks the analyzer for a proposal, validates it, and only then persists it.
   * The analysis and its action items are written in one transaction, so a
   * failure at any point leaves the previous state untouched.
   *
   * Re-analysis replaces the stored analysis and the AI-proposed items nobody
   * has touched; items a human created or edited are kept.
   */
  async analyze(id: string): Promise<MeetingDetail> {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    const { model, result } = await this.requestAnalysis(meeting);

    const analyzedAt = new Date();
    const analysis = {
      summary: result.summary,
      decisions: result.decisions,
      openQuestions: result.openQuestions,
      followUpRequired: result.followUpRequired,
      followUpDate: fromDateOnly(result.followUpDate),
      model,
    };

    await this.prisma.$transaction([
      this.prisma.meetingAnalysis.upsert({
        where: { meetingId: id },
        create: { meetingId: id, ...analysis },
        update: analysis,
      }),
      this.prisma.actionItem.deleteMany({
        where: { meetingId: id, source: 'AI', humanReviewed: false },
      }),
      this.prisma.actionItem.createMany({
        data: result.actionItems.map((item, index) => ({
          meetingId: id,
          task: item.task,
          owner: item.owner,
          deadline: fromDateOnly(item.deadline),
          priority: item.priority,
          source: 'AI' as const,
          // Rows created in one statement share a timestamp; the offset keeps
          // the order Claude proposed them in.
          createdAt: new Date(analyzedAt.getTime() + index),
        })),
      }),
      this.prisma.meeting.update({ where: { id }, data: { analyzedAt } }),
    ]);

    return this.findOne(id);
  }

  private async requestAnalysis(
    meeting: Meeting,
  ): Promise<{ model: string; result: MeetingAnalysisResult }> {
    try {
      const { model, output } = await this.analyzer.analyze({
        title: meeting.title,
        notes: meeting.notes,
        meetingDate: meeting.createdAt,
      });
      return { model, result: parseMeetingAnalysis(output) };
    } catch (error) {
      if (error instanceof MalformedAnalysisError) {
        this.logger.warn(
          `Rejected malformed analysis for meeting ${meeting.id}: ${error.issues.join('; ')}`,
        );
        throw new BadGatewayException(
          'The AI analysis was malformed and was not saved.',
        );
      }
      if (error instanceof AnalyzerUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof AnalyzerRequestError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }
}
