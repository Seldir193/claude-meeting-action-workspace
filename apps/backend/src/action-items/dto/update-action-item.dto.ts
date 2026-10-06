import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../common/date-only.js';
import { Trim } from '../../common/trim.js';
import {
  ActionItemPriority,
  ActionItemStatus,
} from '../../generated/prisma/enums.js';

// Unlike @IsOptional, this still validates an explicit null, so required
// columns cannot be nulled out through a PATCH.
const IfProvided = () => ValidateIf((_, value) => value !== undefined);

/**
 * Every field is optional. `owner` and `deadline` accept an explicit null,
 * which clears them.
 */
export class UpdateActionItemDto {
  @IfProvided()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  task?: string;

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

  @IfProvided()
  @IsEnum(ActionItemPriority)
  priority?: ActionItemPriority;

  @IfProvided()
  @IsEnum(ActionItemStatus)
  status?: ActionItemStatus;
}
