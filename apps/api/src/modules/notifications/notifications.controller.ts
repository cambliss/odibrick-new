import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notifications.list(user, unread === 'true');
  }

  @Get('unread-count')
  count(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Patch('read')
  markRead(@CurrentUser() user: AuthUser, @Body('ids') ids?: number[]) {
    return this.notifications.markRead(user, ids);
  }
}
