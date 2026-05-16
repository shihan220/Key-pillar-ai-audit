import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUser(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateUserDto) {
    return this.usersService.createUser(user, body);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateUserDto) {
    return this.usersService.updateUser(id, user, body);
  }

  @Post(':id/change-password')
  changePassword(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: ChangePasswordDto) {
    return this.usersService.changePassword(id, user, body);
  }
}
