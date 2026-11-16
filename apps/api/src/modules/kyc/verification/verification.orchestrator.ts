import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../common/database/database.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { KycTransitionService } from '../kyc-transition.service';
import { decide, EngineDecision } from './decision.engine';
import {
  KYC_PROVIDER,
  KycVerificationProvider,
  ProviderResult,
  ProviderTimeoutError,
  ProviderTransientError,
} from './provider.interface';
import { isPassportExpired } from '../passport/passport.validator';

export type OrchestratorOutcome =
  | { applied: true; status: 'UNDER_REVIEW' | 'REJECTED'; reasonCode: string }
  | {
      applied: false;
      reason:
        | 'NOT_FOUND'
        | 'SUPERSEDED_ATTEMPT'
        | 'NOT_PROCESSABLE'
        | 'ATTEMPT_NOT_RUNNABLE'
        | 'DUPLICATE_OR_LATE'
        | 'RECORD_NOT_PROCESSING'
        | 'STATE_CHANGED'
        | 'UNKNOWN_ATTEMPT';
    };

const toIso = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
};

/**
 * Runs a verification attempt: SUBMITTED -> PROCESSING -> (provider) -> decision.
 *
 *  - Automatic approval does not exist in Phase 3A: every case ends in
 *    UNDER_REVIEW, except clear deterministic validation failures.
 *  - Provider timeouts/errors are retried (bounded), recorded on the attempt,
 *    and then escalated to manual review. They never reject a user.
 *  - Duplicate or late results, results for superseded attempts, and results
 *    for records that are no longer PROCESSING change nothing.
 *  - Nothing here logs personal data; only ids and codes.
 */
@Injectable()
export class VerificationOrchestrator {
  private readonly logger = new Logger(VerificationOrchestrator.name);

  /** Tunable (and overridden in tests). */
  options = { timeoutMs: 30_000, maxAttempts: 3, baseDelayMs: 500 };
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

  constructor(
    private readonly db: DatabaseService,
    private readonly transitions: KycTransitionService,
    private readonly notify: NotificationsService,
    @Inject(KYC_PROVIDER) private readonly provider: KycVerificationProvider,
  ) {}

  get providerKey(): string {
    return this.provider.key;
  }

  async run(recordId: number, attemptId: number): Promise<OrchestratorOutcome> {
    let record = await this.loadRecord(recordId);
    if (!record) return { applied: false, reason: 'NOT_FOUND' };
    if (record.current_attempt_id !== attemptId) return { applied: false, reason: 'SUPERSEDED_ATTEMPT' };

    if (record.status === 'SUBMITTED') {
      try {
        const t = await this.transitions.transition({ record, to: 'PROCESSING', actor: 'SYSTEM', auditAction: 'kyc.processing_started' });
        record = { ...record, status: 'PROCESSING', decision_version: t.version };
      } catch (err) {
        if (err instanceof ConflictException) return { applied: false, reason: 'STATE_CHANGED' };
        throw err;
      }
    } else if (record.status !== 'PROCESSING') {
      return { applied: false, reason: 'NOT_PROCESSABLE' };
    }

    const claim = await this.db.execute(
      `UPDATE kyc_verification_attempts SET status = 'RUNNING', started_at = NOW()
        WHERE id = ? AND kyc_record_id = ? AND status = 'QUEUED'`,
      [attemptId, recordId],
    );
    if (claim.affectedRows !== 1) return { applied: false, reason: 'ATTEMPT_NOT_RUNNABLE' };

    const attempt = await this.db.one<any>(
      'SELECT id, idempotency_key, retry_count FROM kyc_verification_attempts WHERE id = ?',
      [attemptId],
    );
    const passport = await this.loadPassport(recordId);

    let providerResult: ProviderResult | null = null;
    let failureCode: string | undefined;
    let retries = 0;
    let attemptStatus: 'COMPLETED' | 'TIMED_OUT' | 'FAILED' = 'COMPLETED';

    if (passport && !passport.expired) {
      for (let i = 1; i <= this.options.maxAttempts; i++) {
        try {
          providerResult = await this.withTimeout(
            this.provider.start({
              attemptId,
              idempotencyKey: attempt?.idempotency_key ?? `${recordId}:${attemptId}`,
              kycRecordId: recordId,
              documentIds: passport.documentIds,
              subject: { legalName: passport.holderName ?? '', dateOfBirth: passport.dateOfBirth ?? '', issuingCountry: passport.issuingCountry ?? '' },
            }),
          );
          failureCode = providerResult.failureCode;
          break;
        } catch (err) {
          const timeout = err instanceof ProviderTimeoutError;
          const transient = timeout || err instanceof ProviderTransientError;
          // Only the error class name is logged - messages from providers can contain personal data.
          this.logger.warn(`KYC attempt ${attemptId}: provider ${timeout ? 'timeout' : transient ? 'transient failure' : 'error'} (try ${i}/${this.options.maxAttempts}).`);
          failureCode = timeout ? 'PROVIDER_TIMEOUT' : transient ? 'PROVIDER_TRANSIENT' : 'PROVIDER_ERROR';
          attemptStatus = timeout ? 'TIMED_OUT' : 'FAILED';
          if (!transient) break;
          retries++;
          if (i < this.options.maxAttempts) await this.sleep(this.options.baseDelayMs * 2 ** (i - 1));
        }
      }
    }

    return this.conclude(record, attemptId, providerResult, providerResult ? 'COMPLETED' : attemptStatus, failureCode, retries, passport);
  }

  /**
   * Entry point for asynchronous provider results (webhooks, polling). The
   * caller must already have verified the provider's signature against the raw
   * body and de-duplicated the delivery; this method is additionally idempotent.
   */
  async applyProviderResult(providerKey: string, providerRef: string, result: ProviderResult): Promise<OrchestratorOutcome> {
    const attempt = await this.db.one<any>(
      'SELECT id, kyc_record_id FROM kyc_verification_attempts WHERE provider = ? AND provider_ref = ?',
      [providerKey, providerRef],
    );
    if (!attempt) return { applied: false, reason: 'UNKNOWN_ATTEMPT' };
    const record = await this.loadRecord(attempt.kyc_record_id);
    if (!record) return { applied: false, reason: 'NOT_FOUND' };
    if (record.current_attempt_id !== attempt.id) return { applied: false, reason: 'SUPERSEDED_ATTEMPT' };
    if (record.status !== 'PROCESSING') {
      // Late result: keep it on the attempt for the audit trail, never touch the record.
      await this.db.execute(
        `UPDATE kyc_verification_attempts SET status = 'COMPLETED', outcome = ?, checks = ?, completed_at = NOW()
          WHERE id = ? AND status IN ('QUEUED','RUNNING')`,
        [result.outcome, JSON.stringify(result.checks ?? {}), attempt.id],
      );
      return { applied: false, reason: 'RECORD_NOT_PROCESSING' };
    }
    const passport = await this.loadPassport(record.id);
    return this.conclude(record, attempt.id, result, 'COMPLETED', result.failureCode, 0, passport);
  }

  private async conclude(
    record: any,
    attemptId: number,
    providerResult: ProviderResult | null,
    attemptStatus: 'COMPLETED' | 'TIMED_OUT' | 'FAILED',
    failureCode: string | undefined,
    retries: number,
    passport: PassportFacts | null,
  ): Promise<OrchestratorOutcome> {
    const decision: EngineDecision = decide({
      deterministic: {
        passportMissing: !passport,
        passportExpired: !!passport?.expired,
        passportExpiryDate: passport?.expiryDate ?? null,
      },
      providerResult,
      flags: [],
    });

    // Exactly one writer may complete the attempt: a duplicate or late delivery gets 0 rows and stops here.
    const done = await this.db.execute(
      `UPDATE kyc_verification_attempts
          SET status = ?, outcome = ?, checks = ?, risk_score = ?, failure_code = ?, retry_count = retry_count + ?,
              provider_ref = COALESCE(?, provider_ref), completed_at = NOW()
        WHERE id = ? AND status IN ('QUEUED','RUNNING')`,
      [
        attemptStatus,
        providerResult?.outcome ?? 'ERROR',
        JSON.stringify(providerResult?.checks ?? {}),
        providerResult?.riskScore ?? null,
        (failureCode ?? decision.reasonCode).slice(0, 64),
        retries,
        providerResult?.providerRef ?? null,
        attemptId,
      ],
    );
    if (done.affectedRows !== 1) return { applied: false, reason: 'DUPLICATE_OR_LATE' };

    try {
      if (decision.action === 'REJECT') {
        const message = decision.userMessage ?? 'The submitted passport could not be accepted.';
        await this.transitions.transition({
          record,
          to: 'REJECTED',
          actor: 'SYSTEM',
          reason: message,
          patch: { reviewed_at: new Date(), reviewer_id: null, rejection_reason: message.slice(0, 500) },
          auditAction: 'kyc.auto_rejected',
          auditMetadata: { reasonCode: decision.reasonCode, attemptId },
        });
        await this.transitions.rejectCurrentDocuments(record.id, message);
        await this.notify.send(record.user_id, 'KYC_REJECTED', {
          title: 'Identity verification needs correction',
          body: message,
          severity: 'ACTION',
          actionUrl: '/dashboard/kyc',
        });
        return { applied: true, status: 'REJECTED', reasonCode: decision.reasonCode };
      }
      await this.transitions.transition({
        record,
        to: 'UNDER_REVIEW',
        actor: 'SYSTEM',
        auditAction: 'kyc.escalated_to_review',
        auditMetadata: { reasonCode: decision.reasonCode, attemptId },
      });
      return { applied: true, status: 'UNDER_REVIEW', reasonCode: decision.reasonCode };
    } catch (err) {
      if (err instanceof ConflictException) return { applied: false, reason: 'STATE_CHANGED' };
      throw err;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProviderTimeoutError()), this.options.timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private loadRecord(id: number) {
    return this.db.one<any>(
      `SELECT id, user_id, status, decision_version, current_attempt_id, mandatory_document_id
         FROM kyc_records WHERE id = ?`,
      [id],
    );
  }

  private async loadPassport(recordId: number): Promise<PassportFacts | null> {
    const rows = await this.db.query<any>(
      `SELECT i.document_id, i.holder_name, i.date_of_birth, i.issuing_country, i.expiry_date, d.is_active
         FROM kyc_identity_documents i JOIN documents d ON d.id = i.document_id
        WHERE i.kyc_record_id = ? AND i.doc_type = 'PASSPORT' AND i.is_mandatory = 1 AND i.status <> 'SUPERSEDED'
        LIMIT 1`,
      [recordId],
    );
    const row = rows[0];
    if (!row || !row.is_active) return null;
    const expiryDate = toIso(row.expiry_date);
    return {
      documentIds: [row.document_id],
      holderName: row.holder_name,
      dateOfBirth: toIso(row.date_of_birth),
      issuingCountry: row.issuing_country,
      expiryDate,
      expired: expiryDate ? isPassportExpired(expiryDate) : false,
    };
  }
}

interface PassportFacts {
  documentIds: number[];
  holderName: string | null;
  dateOfBirth: string | null;
  issuingCountry: string | null;
  expiryDate: string | null;
  expired: boolean;
}

