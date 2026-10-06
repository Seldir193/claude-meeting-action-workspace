import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../common/date-only.js';
import { Trim } from '../../common/trim.js';
import {
  ActionItemPriority,
  ActionItemStatus,
} from '../../generated/prisma/enums.js';

export class CreateActionItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  task: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  owner?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'deadline must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  deadline?: string | null;

  @IsOptional()
  @IsEnum(ActionItemPriority)
  priority?: ActionItemPriority;

  @IsOptional()
  @IsEnum(ActionItemStatus)
  status?: ActionItemStatus;
}
