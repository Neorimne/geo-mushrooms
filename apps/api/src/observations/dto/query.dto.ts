import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

/** How far back the list view's sparkline reaches. */
export class SummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days must be an integer' })
  @Min(1, { message: 'days must be at least 1' })
  @Max(60, { message: 'days must be at most 60' })
  days?: number;
}

/** An explicit date window for one city's detail chart. */
export class ObservationsQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'cityId must be an integer' })
  cityId!: number;

  @IsISO8601({}, { message: 'from must be an ISO date (YYYY-MM-DD)' })
  from!: string;

  @IsISO8601({}, { message: 'to must be an ISO date (YYYY-MM-DD)' })
  to!: string;
}
