import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import {
  AdminConversationsQueryDto,
  AssignConversationDto,
  CloseConversationDto,
  ConversationContextType,
  CreateConversationDto,
  EditMessageDto,
  EscalateConversationDto,
  ListConversationsQueryDto,
  ReopenConversationDto,
  ResolveConversationDto,
  SendInternalNoteDto,
  SendMessageDto,
} from './communications.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class CommunicationsController {
  constructor(private readonly coms: CommunicationsService) {}

  @Get('conversations')
  @RequirePermissions('conversation.read')
  listUserConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.coms.listUserConversations(user, query);
  }

  @Get('conversations/context/:contextType/:contextId')
  @RequirePermissions('conversation.read')
  getByContext(
    @CurrentUser() user: AuthUser,
    @Param('contextType') contextType: ConversationContextType,
    @Param('contextId', ParseIntPipe) contextId: number,
  ) {
    return this.coms.getOrCreateConversation(contextType, contextId, undefined, undefined, user);
  }

  @Get('conversations/:id')
  @RequirePermissions('conversation.read')
  getConversationDetail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coms.getConversationDetail(user, id);
  }

  @Get('conversations/:id/messages')
  @RequirePermissions('conversation.read')
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.coms.listConversationMessages(user, id, { page, pageSize });
  }

  @Post('conversations')
  @RequirePermissions('conversation.send')
  createConversation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.coms.getOrCreateConversation(
      dto.contextType,
      dto.contextId,
      dto.title,
      dto.initialMessage,
      user,
    );
  }

  @Post('conversations/:id/messages')
  @RequirePermissions('conversation.send')
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
  ) {
    return this.coms.sendMessage(user, id, dto);
  }

  @Post('conversations/:id/read')
  @RequirePermissions('conversation.read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coms.markAsRead(user, id);
  }

  @Post('conversations/:id/internal-note')
  @RequirePermissions('conversation.internal_note')
  sendInternalNote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendInternalNoteDto,
  ) {
    return this.coms.sendInternalNote(user, id, dto);
  }

  @Patch('conversations/messages/:messageId')
  @RequirePermissions('conversation.send')
  editMessage(
    @CurrentUser() user: AuthUser,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() dto: EditMessageDto,
  ) {
    return this.coms.editMessage(user, messageId, dto);
  }

  @Delete('conversations/messages/:messageId')
  @RequirePermissions('conversation.send')
  deleteMessage(
    @CurrentUser() user: AuthUser,
    @Param('messageId', ParseIntPipe) messageId: number,
  ) {
    return this.coms.deleteMessage(user, messageId);
  }

  @Post('conversations/:id/assign')
  @RequirePermissions('conversation.assign')
  assignConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignConversationDto,
  ) {
    return this.coms.assignConversation(user, id, dto);
  }

  @Post('conversations/:id/escalate')
  @RequirePermissions('conversation.read')
  escalateConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateConversationDto,
  ) {
    return this.coms.escalateConversation(user, id, dto);
  }

  @Post('conversations/:id/resolve')
  @RequirePermissions('conversation.read')
  resolveConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveConversationDto,
  ) {
    return this.coms.resolveConversation(user, id, dto);
  }

  @Post('conversations/:id/reopen')
  @RequirePermissions('conversation.read')
  reopenConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenConversationDto,
  ) {
    return this.coms.reopenConversation(user, id, dto);
  }

  @Post('conversations/:id/close')
  @RequirePermissions('conversation.manage')
  closeConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseConversationDto,
  ) {
    return this.coms.closeConversation(user, id, dto);
  }

  // Admin Management Endpoints
  @Get('admin/conversations')
  @RequirePermissions('conversation.manage')
  listAdminConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminConversationsQueryDto,
  ) {
    return this.coms.listAdminConversations(user, query);
  }

  @Get('admin/conversations/analytics')
  @RequirePermissions('conversation.manage')
  getAdminConversationsAnalytics(@CurrentUser() user: AuthUser) {
    return this.coms.getAdminConversationsAnalytics(user);
  }

  @Post('admin/conversations/process-sla')
  @RequirePermissions('conversation.manage')
  processSla(@CurrentUser() user: AuthUser) {
    return this.coms.processSlaEscalations();
  }
}
