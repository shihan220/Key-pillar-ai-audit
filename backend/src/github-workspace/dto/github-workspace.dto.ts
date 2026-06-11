import { IsString, MinLength } from 'class-validator';

export class CreateGitWorkspaceRepositoryDto {
  @IsString()
  @MinLength(1)
  url!: string;

  @IsString()
  @MinLength(1)
  accessToken!: string;
}
