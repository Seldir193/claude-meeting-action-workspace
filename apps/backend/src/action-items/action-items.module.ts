import { Module } from '@nestjs/common';
import { ActionItemsController } from './action-items.controller.js';
import { ActionItemsService } from './action-items.service.js';

@Module({
  controllers: [ActionItemsController],
  providers: [ActionItemsService],
})
export class ActionItemsModule {}
