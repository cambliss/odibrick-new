import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { AutomationService } from '../automation/automation.service';
import { RiskService } from '../risk/risk.service';
import {
  ExternalIntegrationRecord,
  HealthCheckResult,
  IntegrationCapability,
  IntegrationEventRecord,
  IProviderAdapter,
  WebhookEventRecord,
} from './integrations.types';
import {
  ExecuteTestActionDto,
  QueryIntegrationsDto,
  QueryWebhooksDto,
} from './integrations.dto';
import { ResendEmailAdapter } from './adapters/email.adapter';
import { TwilioSmsAdapter } from './adapters/sms.adapter';
import { MetaWhatsAppAdapter } from './adapters/whatsapp.adapter';
import { RazorpayGatewayAdapter } from './adapters/payment-gateway.adapter';
import { S3StorageAdapter } from './adapters/storage.adapter';
import { HyperVergeKycAdapter } from './adapters/kyc.adapter';
import { LeegalityESignAdapter } from './adapters/esign.adapter';
import { GoogleMapsAdapter } from './adapters/maps.adapter';
import { GoogleCalendarAdapter } from './adapters/calendar.adapter';

@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly adapters = new Map<string, IProviderAdapter>();

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly automation: AutomationService,
    private readonly risk: RiskService,
    private readonly emailAdapter: ResendEmailAdapter,
    private readonly smsAdapter: TwilioSmsAdapter,
    private readonly whatsappAdapter: MetaWhatsAppAdapter,
    private readonly paymentGatewayAdapter: RazorpayGatewayAdapter,
    private readonly storageAdapter: S3StorageAdapter,
    private readonly kycAdapter: HyperVergeKycAdapter,
    private readonly esignAdapter: LeegalityESignAdapter,
    private readonly mapsAdapter: GoogleMapsAdapter,
    private readonly calendarAdapter: GoogleCalendarAdapter,
  ) {}

  onModuleInit() {
    this.registerAdapter(this.emailAdapter);
    this.registerAdapter(this.smsAdapter);
    this.registerAdapter(this.whatsappAdapter);
    this.registerAdapter(this.paymentGatewayAdapter);
    this.registerAdapter(this.storageAdapter);
    this.registerAdapter(this.kycAdapter);
    this.registerAdapter(this.esignAdapter);
    this.registerAdapter(this.mapsAdapter);
    this.registerAdapter(this.calendarAdapter);
    this.logger.log(`Initialized IntegrationsService with ${this.adapters.size} registered provider adapters.`);
  }

  registerAdapter(adapter: IProviderAdapter) {
    this.adapters.set(adapter.key, adapter);
  }

  getAdapter(key: string): IProviderAdapter | undefined {
    return this.adapters.get(key);
  }

  getAdapterByCapability(capability: IntegrationCapability): IProviderAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.capability === capability) return adapter;
    }
    return undefined;
  }

  // ------------------------------------------------------------------ INTEGRATIONS MANAGEMENT
  async getIntegrations(query: QueryIntegrationsDto): Promise<ExternalIntegrationRecord[]> {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.capability) {
      conditions.push('capability = ?');
      params.push(query.capability);
    }
    if (query.healthStatus) {
      conditions.push('health_status = ?');
      params.push(query.healthStatus);
    }
    if (query.isEnabled !== undefined) {
      conditions.push('is_enabled = ?');
      params.push(query.isEnabled ? 1 : 0);
    }

    const rows = await this.db.query<any>(
      `SELECT * FROM external_integrations WHERE ${conditions.join(' AND ')} ORDER BY id ASC`,
      params,
    );

    return rows.map((r) => this.formatIntegration(r));
  }

  async getIntegrationById(id: number | string): Promise<ExternalIntegrationRecord & { events: IntegrationEventRecord[]; runtimeValidation: any }> {
    const isNum = !isNaN(Number(id));
    const row = await this.db.one<any>(
      `SELECT * FROM external_integrations WHERE ${isNum ? 'id = ?' : 'public_id = ? OR provider_key = ?'} LIMIT 1`,
      isNum ? [id] : [id, id],
    );

    if (!row) throw new NotFoundException(`Integration with ID ${id} not found.`);

    const events = await this.db.query<any>(
      `SELECT * FROM integration_events WHERE integration_id = ? ORDER BY created_at DESC LIMIT 20`,
      [row.id],
    );

    const adapter = this.getAdapter(row.provider_key);
    const runtimeValidation = adapter ? adapter.validateConfig() : { valid: false, isConfigured: false };

    return {
      ...this.formatIntegration(row),
      events: events.map((e) => this.formatIntegrationEvent(e)),
      runtimeValidation,
    };
  }

  async testIntegration(id: number | string, actor?: AuthUser): Promise<HealthCheckResult> {
    const integration = await this.getIntegrationById(id);
    const adapter = this.getAdapter(integration.provider_key);

    if (!adapter) {
      throw new BadRequestException(`No active runtime adapter found for provider ${integration.provider_key}.`);
    }

    const start = Date.now();
    let result: HealthCheckResult;
    let eventStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let errorMessage: string | null = null;

    try {
      result = await adapter.testConnection();
      eventStatus = result.status === 'FAILING' ? 'FAILED' : 'SUCCESS';
    } catch (err: any) {
      result = {
        status: 'FAILING',
        latencyMs: Date.now() - start,
        message: `Diagnostic connection test failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
      eventStatus = 'FAILED';
      errorMessage = err.message;
    }

    // Update integration health in database
    await this.db.execute(
      `UPDATE external_integrations
       SET health_status = ?,
           last_health_check_at = NOW(),
           last_success_at = ${eventStatus === 'SUCCESS' ? 'NOW()' : 'last_success_at'},
           last_failure_at = ${eventStatus === 'FAILED' ? 'NOW()' : 'last_failure_at'},
           failure_count = ${eventStatus === 'FAILED' ? 'failure_count + 1' : '0'},
           error_summary = ?
       WHERE id = ?`,
      [result.status, errorMessage, integration.id],
    );

    // Log integration diagnostic event
    await this.db.execute(
      `INSERT INTO integration_events (
        public_id, integration_id, event_type, direction, status, duration_ms,
        request_summary, response_summary, error_message
      ) VALUES (?, ?, 'CONNECTION_TEST', 'OUTBOUND', ?, ?, ?, ?, ?)`,
      [
        newPublicId(),
        integration.id,
        eventStatus,
        result.latencyMs,
        `PING ${integration.base_url || integration.provider_key}`,
        result.message,
        errorMessage,
      ],
    );

    // Audit log
    await this.audit.record({
      actor,
      action: 'integration.tested',
      objectType: 'external_integrations',
      objectId: integration.id,
      metadata: { provider: integration.provider_key, result: result.status, latencyMs: result.latencyMs },
    });

    return result;
  }

  async toggleIntegration(id: number | string, isEnabled: boolean, actor?: AuthUser): Promise<ExternalIntegrationRecord> {
    const integration = await this.getIntegrationById(id);
    const newHealth = isEnabled ? 'HEALTHY' : 'DISABLED';

    await this.db.execute(
      `UPDATE external_integrations SET is_enabled = ?, health_status = ? WHERE id = ?`,
      [isEnabled ? 1 : 0, newHealth, integration.id],
    );

    await this.audit.record({
      actor,
      action: isEnabled ? 'integration.enabled' : 'integration.disabled',
      objectType: 'external_integrations',
      objectId: integration.id,
      metadata: { provider: integration.provider_key, capability: integration.capability },
    });

    return this.getIntegrationById(integration.id);
  }

  async executeTestAction(id: number | string, dto: ExecuteTestActionDto, actor?: AuthUser): Promise<any> {
    const integration = await this.getIntegrationById(id);
    const adapter = this.getAdapter(integration.provider_key);
    if (!adapter) throw new BadRequestException(`Adapter ${integration.provider_key} not available.`);

    const start = Date.now();
    let result: any;

    switch (integration.capability) {
      case 'EMAIL':
        result = await (adapter as ResendEmailAdapter).sendEmail({
          to: dto.payload?.to || 'test@odibrick.com',
          subject: dto.payload?.subject || 'Odibrick Integration Test Email',
          body: dto.payload?.body || 'This is a test notification dispatched from the External Integrations Platform.',
        });
        break;
      case 'SMS':
        result = await (adapter as TwilioSmsAdapter).sendSms({
          phone: dto.payload?.phone || '+919876543210',
          message: dto.payload?.message || 'Your Odibrick OTP is 894102. Valid for 10 minutes.',
        });
        break;
      case 'WHATSAPP':
        result = await (adapter as MetaWhatsAppAdapter).sendTemplate({
          phone: dto.payload?.phone || '+919876543210',
          templateName: dto.payload?.templateName || 'visit_reminder_v1',
        });
        break;
      case 'PAYMENT_GATEWAY':
        result = await (adapter as RazorpayGatewayAdapter).createOrder({
          referenceCode: dto.payload?.referenceCode || `TEST-PAY-${Date.now()}`,
          amount: dto.payload?.amount || 1000,
          currency: 'INR',
          purpose: 'MONTHLY_RENT',
          customer: { name: 'Rahul Test', email: 'rahul@odibrick.com' },
        });
        break;
      case 'MAPS':
        result = await (adapter as GoogleMapsAdapter).geocode(
          dto.payload?.address || '100 Feet Road, Indiranagar, Bengaluru',
        );
        break;
      case 'CALENDAR':
        result = await (adapter as GoogleCalendarAdapter).createEvent({
          title: dto.payload?.title || 'Property Walkthrough - Indiranagar Flat',
          description: 'Scheduled visit via Odibrick platform.',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
          attendees: [{ email: 'tenant@odibrick.com' }, { email: 'owner@odibrick.com' }],
        });
        break;
      default:
        result = await adapter.testConnection();
    }

    const duration = Date.now() - start;

    // Record outbound telemetry event
    await this.db.execute(
      `INSERT INTO integration_events (
        public_id, integration_id, event_type, direction, status, duration_ms,
        request_summary, response_summary
      ) VALUES (?, ?, ?, 'OUTBOUND', 'SUCCESS', ?, ?, ?)`,
      [
        newPublicId(),
        integration.id,
        dto.action,
        duration,
        JSON.stringify(dto.payload || {}).slice(0, 200),
        JSON.stringify(result || {}).slice(0, 200),
      ],
    );

    return { result, durationMs: duration };
  }

  async getHealthSummary(): Promise<{
    total: number;
    healthy: number;
    degraded: number;
    failing: number;
    disabled: number;
    notConfigured: number;
    webhookTotal: number;
    webhookSuccessRate: number;
  }> {
    const counts = await this.db.one<any>(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN health_status = 'HEALTHY' THEN 1 END) as healthy,
         COUNT(CASE WHEN health_status = 'DEGRADED' THEN 1 END) as degraded,
         COUNT(CASE WHEN health_status = 'FAILING' THEN 1 END) as failing,
         COUNT(CASE WHEN health_status = 'DISABLED' THEN 1 END) as disabled,
         COUNT(CASE WHEN health_status = 'NOT_CONFIGURED' THEN 1 END) as notConfigured
       FROM external_integrations`,
    );

    const whCounts = await this.db.one<any>(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN processing_status = 'PROCESSED' THEN 1 END) as processed
       FROM webhook_events`,
    );

    const totalWh = Number(whCounts?.total || 0);
    const processedWh = Number(whCounts?.processed || 0);
    const webhookSuccessRate = totalWh > 0 ? Math.round((processedWh / totalWh) * 1000) / 10 : 100;

    return {
      total: Number(counts?.total || 0),
      healthy: Number(counts?.healthy || 0),
      degraded: Number(counts?.degraded || 0),
      failing: Number(counts?.failing || 0),
      disabled: Number(counts?.disabled || 0),
      notConfigured: Number(counts?.notConfigured || 0),
      webhookTotal: totalWh,
      webhookSuccessRate,
    };
  }

  // ------------------------------------------------------------------ CENTRAL WEBHOOK ENGINE
  async handleWebhook(
    providerKey: string,
    payload: any,
    headers: Record<string, string>,
    rawBody?: string,
  ): Promise<{ status: string; eventId?: number; publicId?: string; verified: boolean; message: string }> {
    const adapter = this.getAdapter(providerKey);
    const rawBodyStr = rawBody || JSON.stringify(payload);
    const payloadHash = createHash('sha256').update(rawBodyStr).digest('hex');

    // 1. Signature Verification
    let signatureStatus: 'VERIFIED' | 'INVALID' | 'SKIPPED' = 'VERIFIED';
    if (adapter) {
      const verifyRes = await adapter.verifyWebhook(headers, rawBodyStr, payload);
      if (!verifyRes.verified) {
        signatureStatus = 'INVALID';
      }
    }

    // Extract external event ID
    const externalEventId =
      payload?.id ||
      payload?.event_id ||
      payload?.eventId ||
      headers['x-event-id'] ||
      `evt_${providerKey}_${payloadHash.slice(0, 16)}`;

    const eventType = payload?.event || payload?.type || payload?.eventType || 'webhook.received';
    const publicId = `WHK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    // 2. Handle Invalid Signature Security Event
    if (signatureStatus === 'INVALID') {
      try {
        // Record invalid webhook attempt
        await this.db.execute(
          `INSERT INTO webhook_events (
            public_id, provider, event_type, external_event_id, signature_status,
            processing_status, payload_hash, payload, error_message
          ) VALUES (?, ?, ?, ?, 'INVALID', 'FAILED', ?, ?, 'Invalid HMAC signature header')`,
          [publicId, providerKey, eventType, externalEventId, payloadHash, JSON.stringify(payload)],
        );

        // Phase 17 Security Telemetry Integration:
        await this.risk.logSecurityEvent({
          eventType: 'INVALID_WEBHOOK_SIGNATURE',
          severity: 'HIGH',
          summary: `Invalid webhook signature received from external provider endpoint (${providerKey}).`,
          entityType: 'webhook_event',
          entityId: publicId,
          metadata: { provider: providerKey, externalEventId, headers },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to record invalid signature security event: ${err.message}`);
      }

      return {
        status: 'INVALID_SIGNATURE',
        publicId,
        verified: false,
        message: 'Webhook signature verification failed.',
      };
    }

    // 3. Deduplication Check (Provider + External Event ID)
    const existing = await this.db.one<any>(
      `SELECT id, public_id, processing_status FROM webhook_events WHERE provider = ? AND external_event_id = ? LIMIT 1`,
      [providerKey, externalEventId],
    );

    if (existing) {
      if (existing.processing_status === 'PROCESSED') {
        this.logger.log(`Skipping duplicate webhook event ${providerKey}:${externalEventId}`);
        return {
          status: 'DUPLICATE_SKIPPED',
          eventId: existing.id,
          publicId: existing.public_id,
          verified: true,
          message: 'Duplicate webhook already processed.',
        };
      }
    }

    // 4. Save to durable Webhook Store
    const [res]: any = await this.db.execute(
      `INSERT INTO webhook_events (
        public_id, provider, event_type, external_event_id, signature_status,
        processing_status, payload_hash, payload
      ) VALUES (?, ?, ?, ?, 'VERIFIED', 'PROCESSING', ?, ?)
      ON DUPLICATE KEY UPDATE processing_status = 'PROCESSING', retry_count = retry_count + 1`,
      [publicId, providerKey, eventType, externalEventId, payloadHash, JSON.stringify(payload)],
    );
    const webhookId = res.insertId || existing?.id;

    // 5. Domain Routing & Execution
    try {
      await this.routeWebhookDomainAction(providerKey, eventType, payload);

      // Phase 14 Workflow Automation Engine Integration
      await this.automation.emit({
        eventType: 'PROVIDER_WEBHOOK_PROCESSED',
        entityType: 'webhook_event',
        entityId: webhookId,
        payload: { provider: providerKey, eventType, externalEventId },
      });

      // Update to PROCESSED
      await this.db.execute(
        `UPDATE webhook_events SET processing_status = 'PROCESSED', processed_at = NOW() WHERE id = ?`,
        [webhookId],
      );

      return {
        status: 'PROCESSED',
        eventId: webhookId,
        publicId,
        verified: true,
        message: 'Webhook processed successfully.',
      };
    } catch (err: any) {
      await this.db.execute(
        `UPDATE webhook_events SET processing_status = 'FAILED', error_message = ? WHERE id = ?`,
        [err.message, webhookId],
      );

      return {
        status: 'FAILED',
        eventId: webhookId,
        publicId,
        verified: true,
        message: `Webhook processing error: ${err.message}`,
      };
    }
  }

  private async routeWebhookDomainAction(provider: string, eventType: string, payload: any): Promise<void> {
    this.logger.log(`Routing webhook action for provider ${provider}, event ${eventType}`);
    // Safe domain orchestration (e.g. payment confirmation, signature completion)
    if (provider === 'razorpay' && eventType === 'payment.captured') {
      const orderId = payload?.payload?.payment?.entity?.order_id;
      if (orderId) {
        this.logger.log(`Verified payment gateway captured event for order ${orderId}`);
      }
    } else if (provider === 'leegality_esign' && (eventType === 'document.signed' || eventType === 'document.completed')) {
      const docId = payload?.documentId;
      if (docId) {
        this.logger.log(`Verified e-signature completion callback for document ${docId}`);
      }
    }
  }

  async getWebhooks(query: QueryWebhooksDto): Promise<{ data: WebhookEventRecord[]; total: number; page: number; pageSize: number }> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.provider) {
      conditions.push('provider = ?');
      params.push(query.provider);
    }
    if (query.eventType) {
      conditions.push('event_type = ?');
      params.push(query.eventType);
    }
    if (query.processingStatus) {
      conditions.push('processing_status = ?');
      params.push(query.processingStatus);
    }
    if (query.search) {
      conditions.push('(public_id LIKE ? OR external_event_id LIKE ? OR event_type LIKE ?)');
      const term = `%${query.search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) as total FROM webhook_events WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRow?.total || 0);

    const rows = await this.db.query<any>(
      `SELECT * FROM webhook_events WHERE ${whereClause} ORDER BY received_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      data: rows.map((r) => this.formatWebhook(r)),
      total,
      page,
      pageSize,
    };
  }

  async getWebhookById(id: number | string): Promise<WebhookEventRecord> {
    const isNum = !isNaN(Number(id));
    const row = await this.db.one<any>(
      `SELECT * FROM webhook_events WHERE ${isNum ? 'id = ?' : 'public_id = ? OR external_event_id = ?'} LIMIT 1`,
      isNum ? [id] : [id, id],
    );
    if (!row) throw new NotFoundException(`Webhook event ${id} not found.`);
    return this.formatWebhook(row);
  }

  async retryWebhook(id: number | string, actor?: AuthUser): Promise<WebhookEventRecord> {
    const webhook = await this.getWebhookById(id);
    if (webhook.signature_status === 'INVALID') {
      throw new BadRequestException('Cannot retry webhook with INVALID signature.');
    }

    try {
      await this.routeWebhookDomainAction(webhook.provider, webhook.event_type, webhook.payload);
      await this.db.execute(
        `UPDATE webhook_events
         SET processing_status = 'PROCESSED', processed_at = NOW(), retry_count = retry_count + 1, error_message = NULL
         WHERE id = ?`,
        [webhook.id],
      );

      await this.audit.record({
        actor,
        action: 'integration.webhook_retried',
        objectType: 'webhook_events',
        objectId: webhook.id,
        metadata: { provider: webhook.provider, eventType: webhook.event_type },
      });

      return this.getWebhookById(webhook.id);
    } catch (err: any) {
      await this.db.execute(
        `UPDATE webhook_events SET retry_count = retry_count + 1, error_message = ? WHERE id = ?`,
        [err.message, webhook.id],
      );
      throw new BadRequestException(`Retry execution failed: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------ FORMATTERS
  private formatIntegration(row: any): ExternalIntegrationRecord {
    return {
      id: row.id,
      public_id: row.public_id,
      capability: row.capability,
      provider_key: row.provider_key,
      name: row.name,
      description: row.description,
      is_enabled: Boolean(row.is_enabled),
      is_configured: Boolean(row.is_configured),
      health_status: row.health_status,
      environment: row.environment,
      base_url: row.base_url,
      config_metadata: typeof row.config_metadata === 'string' ? JSON.parse(row.config_metadata) : row.config_metadata,
      last_health_check_at: row.last_health_check_at,
      last_success_at: row.last_success_at,
      last_failure_at: row.last_failure_at,
      failure_count: Number(row.failure_count || 0),
      error_summary: row.error_summary,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private formatIntegrationEvent(row: any): IntegrationEventRecord {
    return {
      id: row.id,
      public_id: row.public_id,
      integration_id: row.integration_id,
      event_type: row.event_type,
      direction: row.direction,
      status: row.status,
      duration_ms: Number(row.duration_ms || 0),
      request_summary: row.request_summary,
      response_summary: row.response_summary,
      error_message: row.error_message,
      created_at: row.created_at,
    };
  }

  private formatWebhook(row: any): WebhookEventRecord {
    return {
      id: row.id,
      public_id: row.public_id,
      provider: row.provider,
      event_type: row.event_type,
      external_event_id: row.external_event_id,
      signature_status: row.signature_status,
      processing_status: row.processing_status,
      payload_hash: row.payload_hash,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      retry_count: Number(row.retry_count || 0),
      error_message: row.error_message,
      received_at: row.received_at,
      processed_at: row.processed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
