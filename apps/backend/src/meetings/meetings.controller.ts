import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import type { MeetingDetail, MeetingListItem } from './meeting.responses.js';
import { MeetingsService } from './meetings.service.js';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  create(@Body() dto: CreateMeetingDto): Promise<MeetingDetail> {
    return this.meetings.create(dto);
  }

  @Get()
  findAll(): Promise<MeetingListItem[]> {
    return this.meetings.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MeetingDetail> {
    return this.meetings.findOne(id);
  }

  @Post(':id/analyze')
  @HttpCode(200)
  analyze(@Param('id', ParseUUIDPipe) id: string): Promise<MeetingDetail> {
    return this.meetings.analyze(id);
  }
}
