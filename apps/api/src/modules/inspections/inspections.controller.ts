import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { InspectionsService } from './inspections.service';
import {
  AcknowledgeDto, AddMediaDto, SaveItemsDto, StartInspectionDto, SubmitInspectionDto,
} from './inspections.dto';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Public()
  @Get('checklist')
  checklist() {
    return this.inspections.checklist();
  }

  @Get()
  forTenancy(@CurrentUser() user: AuthUser, @Query('tenancyId', ParseIntPipe) tenancyId: number) {
    return this.inspections.listForTenancy(user, tenancyId);
  }

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartInspectionDto, @Req() req: Request) {
    return this.inspections.start(user, dto, req);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.inspections.detail(user, id);
  }

  @Put(':id/items')
  saveItems(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SaveItemsDto) {
    return this.inspections.saveItems(user, id, dto.items);
  }

  @Post(':id/media')
  addMedia(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AddMediaDto) {
    return this.inspections.addMedia(user, id, dto);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitInspectionDto,
    @Req() req: Request,
  ) {
    return this.inspections.submit(user, id, dto, req);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcknowledgeDto,
    @Req() req: Request,
  ) {
    return this.inspections.acknowledge(user, id, dto, req);
  }
}
