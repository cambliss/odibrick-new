import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { InvoicesService } from './invoices.service';
import {
  CancelInvoiceDto,
  GenerateInvoiceDto,
  InvoiceQueryDto,
  UpdateIssuerConfigDto,
} from './invoices.dto';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: InvoiceQueryDto) {
    return this.invoices.listInvoices(user, query);
  }

  @Get('issuer-profile')
  @RequirePermissions('payment.manage')
  getIssuerProfile() {
    return this.invoices.getIssuerProfile();
  }

  @Put('issuer-profile')
  @RequirePermissions('payment.manage')
  updateIssuerProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateIssuerConfigDto,
    @Req() req: Request,
  ) {
    return this.invoices.updateIssuerProfile(user, dto, req);
  }

  @Post('from-payment/:paymentId')
  @RequirePermissions('payment.manage')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() dto: GenerateInvoiceDto,
    @Req() req: Request,
  ) {
    return this.invoices.generateInvoiceForPayment(user, paymentId, dto, req);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.invoices.getInvoice(user, id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const { buffer, filename } = await this.invoices.getInvoicePdf(user, id, req);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Post(':id/cancel')
  @RequirePermissions('payment.manage')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelInvoiceDto,
    @Req() req: Request,
  ) {
    return this.invoices.cancelInvoice(user, id, dto, req);
  }
}
