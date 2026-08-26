import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './users.dto';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me/profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.users.profile(user);
  }

  @Patch('me/profile')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user, dto);
  }

  @Get('me/summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.users.dashboardSummary(user);
  }

  @Get('me/saved')
  saved(@CurrentUser() user: AuthUser) {
    return this.users.savedProperties(user);
  }

  @Post('me/saved/:propertyId')
  toggleSaved(@CurrentUser() user: AuthUser, @Param('propertyId', ParseIntPipe) propertyId: number) {
    return this.users.toggleSaved(user, propertyId);
  }

  @Public()
  @Get('profiles/:publicId')
  publicProfile(@Param('publicId') publicId: string) {
    return this.users.publicProfile(publicId);
  }
}
