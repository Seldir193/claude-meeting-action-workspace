import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActionItemsModule } from './action-items/action-items.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MeetingsModule,
    ActionItemsModule,
  ],
})
export class AppModule {}
