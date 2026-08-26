import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomToken } from '../util/crypto';

/**
 * Users never see raw backend errors. Unexpected failures return a trace id
 * that support can match against the server log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const traceId = randomToken(8);

    let message: string | string[] = 'Something went wrong on our side. Try again in a moment.';
    let code = 'INTERNAL_ERROR';

    if (isHttp) {
      const payload = exception.getResponse() as any;
      message = typeof payload === 'string' ? payload : payload.message ?? exception.message;
      code = typeof payload === 'object' && payload.error ? payload.error : exception.name;
    } else {
      this.logger.error(
        `[${traceId}] ${req.method} ${req.originalUrl} — ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    res.status(status).json({
      statusCode: status,
      code,
      message,
      traceId,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
