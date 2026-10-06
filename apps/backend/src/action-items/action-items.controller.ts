import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { ActionItemResponse } from '../meetings/meeting.responses.js';
import { ActionItemsService } from './action-items.service.js';
import { CreateActionItemDto } from './dto/create-action-item.dto.js';
import { UpdateActionItemDto } from './dto/update-action-item.dto.js';

@Controller()
export class ActionItemsController {
  constructor(private readonly actionItems: ActionItemsService) {}

  @Post('meetings/:meetingId/action-items')
  create(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: CreateActionItemDto,
  ): Promise<ActionItemResponse> {
    return this.actionItems.create(meetingId, dto);
  }

  @Patch('action-items/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActionItemDto,
  ): Promise<ActionItemResponse> {
    return this.actionItems.update(id, dto);
  }

  @Delete('action-items/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.actionItems.remove(id);
  }
}
