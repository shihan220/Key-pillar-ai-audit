import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const taskStatuses = ['Pending', 'In Progress', 'Failed', 'Waiting for Approval', 'Complete'] as const;
const commentTypes = ['Normal Comment', 'Issue Comment'] as const;

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  developerId!: string;

  @IsString()
  @MinLength(1)
  dueDate!: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  projectId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  developerId?: string;

  @IsOptional()
  @IsIn(taskStatuses)
  status?: (typeof taskStatuses)[number];
}

export class ReassignTaskDto {
  @IsString()
  @MinLength(1)
  developerId!: string;
}

export class ChangeTaskStatusDto {
  @IsIn(taskStatuses)
  status!: (typeof taskStatuses)[number];
}

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsIn(commentTypes)
  type!: (typeof commentTypes)[number];
}
