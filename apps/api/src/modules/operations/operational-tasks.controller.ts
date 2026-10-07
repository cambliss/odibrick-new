import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { OperationalTasksService } from './operational-tasks.service';
import {
  CreateOperationalTaskDto,
  AssignOperationalTaskDto,
  UpdateTaskPriorityDto,
  UpdateTaskStatusDto,
  EscalateOperationalTaskDto,
  ResolveOperationalTaskDto,
  ReopenOperationalTaskDto,
  AddTaskCommentDto,
  TaskQueryDto,
} from './operational-tasks.dto';

@Controller('admin/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class OperationalTasksController {
  constructor(private readonly tasksService: OperationalTasksService) {}

  @Get('overview')
  @RequirePermissions('operations.read')
  async getOverview(@CurrentUser() user: AuthUser) {
    return this.tasksService.getOverview(user);
  }

  @Get('exceptions')
  @RequirePermissions('operations.read')
  async getExceptions() {
    return this.tasksService.getExceptionsOverview();
  }

  @Get('tasks')
  @RequirePermissions('operations.read')
  async getTasks(@CurrentUser() user: AuthUser, @Query() query: TaskQueryDto) {
    return this.tasksService.getTasks(user, query);
  }

  @Get('tasks/:id')
  @RequirePermissions('operations.read')
  async getTaskById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tasksService.getTaskById(user, id);
  }

  @Post('tasks')
  @RequirePermissions('operations.manage')
  async createTask(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOperationalTaskDto,
  ) {
    return this.tasksService.createTask(user, dto);
  }

  @Patch('tasks/:id/assign')
  @RequirePermissions('operations.assign')
  async assignTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignOperationalTaskDto,
  ) {
    return this.tasksService.assignTask(user, id, dto);
  }

  @Patch('tasks/:id/priority')
  @RequirePermissions('operations.manage')
  async updatePriority(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskPriorityDto,
  ) {
    return this.tasksService.updatePriority(user, id, dto);
  }

  @Patch('tasks/:id/status')
  @RequirePermissions('operations.manage')
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(user, id, dto);
  }

  @Post('tasks/:id/escalate')
  @RequirePermissions('operations.manage')
  async escalateTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateOperationalTaskDto,
  ) {
    return this.tasksService.escalateTask(user, id, dto);
  }

  @Post('tasks/:id/resolve')
  @RequirePermissions('operations.resolve')
  async resolveTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveOperationalTaskDto,
  ) {
    return this.tasksService.resolveTask(user, id, dto);
  }

  @Post('tasks/:id/reopen')
  @RequirePermissions('operations.resolve')
  async reopenTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenOperationalTaskDto,
  ) {
    return this.tasksService.reopenTask(user, id, dto);
  }

  @Post('tasks/:id/comments')
  @RequirePermissions('operations.manage')
  async addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddTaskCommentDto,
  ) {
    return this.tasksService.addComment(user, id, dto);
  }
}
