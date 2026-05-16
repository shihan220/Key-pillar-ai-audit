import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const roles = ['Developer', 'Admin'] as const;
const accountStatuses = ['Active', 'Inactive'] as const;

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(roles)
  role!: (typeof roles)[number];

  @IsIn(accountStatuses)
  accountStatus!: (typeof accountStatuses)[number];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(roles)
  role?: (typeof roles)[number];

  @IsOptional()
  @IsIn(accountStatuses)
  accountStatus?: (typeof accountStatuses)[number];
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(6)
  confirmPassword!: string;
}
