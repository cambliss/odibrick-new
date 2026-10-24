import {
  Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { LegalService } from './legal.service';
import {
  ApproveAgreementDto, AssignCaseDto, DraftAgreementDto, LegalNoteDto, ScheduleMeetingDto, SignAgreementDto,
  SubmitStampingCertificateDto, VerifyStampingDto, RejectStampingDto, StampingNotApplicableDto,
} from './legal.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('legal/cases')
  @RequirePermissions('legal.case.manage')
  cases(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
    @Query('page') page?: number,
  ) {
    return this.legal.caseQueue(user, status, mine === 'true', page);
  }

  @Get('legal/cases/:id')
  caseDetail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.legal.caseDetail(user, id);
  }

  @Post('legal/cases/:id/assign')
  @RequirePermissions('legal.case.manage')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignCaseDto,
    @Req() req: Request,
  ) {
    return this.legal.assign(user, id, dto, req);
  }

  @Post('legal/cases/:id/notes')
  @RequirePermissions('legal.case.manage')
  addNote(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: LegalNoteDto) {
    return this.legal.addNote(user, id, dto.body, dto.visibility ?? 'INTERNAL');
  }

  @Get('legal/clauses')
  @RequirePermissions('agreement.draft')
  clauses(@Query('category') category?: string) {
    return this.legal.clauseLibrary(category);
  }

  @Post('legal/cases/:id/draft')
  @RequirePermissions('agreement.draft')
  draft(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DraftAgreementDto,
    @Req() req: Request,
  ) {
    return this.legal.draft(user, id, dto, req);
  }

  @Get('agreements/:id')
  agreement(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.legal.agreementDetail(user, id);
  }

  @Post('agreements/:id/approve')
  @RequirePermissions('agreement.approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveAgreementDto,
    @Req() req: Request,
  ) {
    return this.legal.approve(user, id, dto, req);
  }

  @Post('agreements/:id/sign')
  sign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignAgreementDto,
    @Req() req: Request,
  ) {
    return this.legal.sign(user, id, dto, req);
  }

  @Post('legal/meetings')
  @RequirePermissions('legal.case.manage')
  schedule(@CurrentUser() user: AuthUser, @Body() dto: ScheduleMeetingDto, @Req() req: Request) {
    return this.legal.scheduleMeeting(user, dto, req);
  }

  @Get('legal/meetings/mine')
  meetings(@CurrentUser() user: AuthUser) {
    return this.legal.myMeetings(user);
  }

  @Post('legal/meetings/:id/complete')
  @RequirePermissions('legal.case.manage')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('outcomeNotes') outcomeNotes: string,
  ) {
    return this.legal.completeMeeting(user, id, outcomeNotes);
  }

  @Post('agreements/:id/stamping/submit')
  submitStamping(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitStampingCertificateDto,
    @Req() req: Request,
  ) {
    return this.legal.submitStampingCertificate(user, id, dto, req);
  }

  @Post('agreements/:id/stamping/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15_728_640 } }))
  uploadStamping(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SubmitStampingCertificateDto,
    @Req() req: Request,
  ) {
    return this.legal.uploadStampingCertificate(user, id, file, dto, req);
  }

  @Post('agreements/:id/stamping/verify')
  verifyStamping(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyStampingDto,
    @Req() req: Request,
  ) {
    return this.legal.verifyStamping(user, id, dto, req);
  }

  @Post('agreements/:id/stamping/reject')
  rejectStamping(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectStampingDto,
    @Req() req: Request,
  ) {
    return this.legal.rejectStamping(user, id, dto, req);
  }

  @Post('agreements/:id/stamping/not-applicable')
  stampingNotApplicable(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StampingNotApplicableDto,
    @Req() req: Request,
  ) {
    return this.legal.markStampingNotApplicable(user, id, dto, req);
  }
}
