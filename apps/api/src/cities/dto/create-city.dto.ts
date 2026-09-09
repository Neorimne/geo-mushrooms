import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCityDto {
  @IsString({ message: 'City name must be a string' })
  @IsNotEmpty({ message: 'City name is required' })
  name!: string;

  @IsString({ message: 'City slug must be a string' })
  @IsNotEmpty({ message: 'City slug is required' })
  slug!: string;

  // Existing area to attach the city to. Either areaId or areaName must be
  // supplied; that cross-field rule is enforced in CitiesService.create.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'areaId must be an integer' })
  areaId?: number;

  // Name of a new area to create (used when areaId is not provided).
  @IsOptional()
  @IsString({ message: 'areaName must be a string' })
  areaName?: string;
}
