import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const projectStatuses = ['Not Started', 'In Progress', 'Completed', 'Archived'] as const;

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsIn(projectStatuses)
  status!: (typeof projectStatuses)[number];
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsIn(projectStatuses)
  status?: (typeof projectStatuses)[number];
}
