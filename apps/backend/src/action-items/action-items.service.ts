import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fromDateOnly } from '../common/date-only.js';
import {
  ActionItemResponse,
  toActionItemResponse,
} from '../meetings/meeting.responses.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateActionItemDto } from './dto/create-action-item.dto.js';
import { UpdateActionItemDto } from './dto/update-action-item.dto.js';

@Injectable()
export class ActionItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    meetingId: string,
    dto: CreateActionItemDto,
  ): Promise<ActionItemResponse> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const item = await this.prisma.actionItem.create({
      data: {
        meetingId,
        task: dto.task,
        owner: dto.owner ?? null,
        deadline: fromDateOnly(dto.deadline ?? null),
        priority: dto.priority,
        status: dto.status,
        source: 'HUMAN',
        humanReviewed: true,
      },
    });
    return toActionItemResponse(item);
  }

  /** Applies a human edit. Any edit marks the item as human-reviewed. */
  async update(
    id: string,
    dto: UpdateActionItemDto,
  ): Promise<ActionItemResponse> {
    const { deadline, ...rest } = dto;
    const changes = {
      ...rest,
      ...(deadline !== undefined && { deadline: fromDateOnly(deadline) }),
    };
    if (Object.values(changes).every((value) => value === undefined)) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.findOrThrow(id);
    const item = await this.prisma.actionItem.update({
      where: { id },
      data: { ...changes, humanReviewed: true },
    });
    return toActionItemResponse(item);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.actionItem.delete({ where: { id } });
  }

  private async findOrThrow(id: string): Promise<void> {
    const item = await this.prisma.actionItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException(`Action item ${id} not found`);
    }
  }
}
