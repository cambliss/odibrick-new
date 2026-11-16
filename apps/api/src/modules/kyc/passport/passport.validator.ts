import { MrzParseError, MrzResult, parseMrz } from './mrz.parser';

/**
 * Country-agnostic passport input validation.
 *
 * - No country-specific passport-number pattern is enforced (formats differ
 *   across issuers); only a generic sanity pattern is applied.
 * - Results are for triage only: nothing here proves a passport is authentic.
 */

export type MatchLevel = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'UNKNOWN';

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export interface PassportInput {
  number: string;
  legalName: string;
  issuingCountry: string;
  nationality?: string;
  dateOfBirth: string;
  issueDate?: string;
  expiryDate: string;
  mrzLines?: string[];
}

export interface PassportContext {
  /** Account holder's display name (users.full_name) – compared, never trusted. */
  accountName?: string | null;
  /** user_profiles.date_of_birth when known (YYYY-MM-DD). */
  profileDob?: string | null;
  now?: Date;
}

export interface NormalisedPassport {
  number: string;
  last4: string;
  issuingCountry: string;
  nationality: string | null;
  holderName: string;
  dateOfBirth: string;
  issueDate: string | null;
  expiryDate: string;
  mrz: { format: string; checks: Record<string, boolean | null>; allValid: boolean } | null;
  nameMatch: MatchLevel;
  dobMatch: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  extractionSource: 'USER' | 'LOCAL_MRZ';
  /** Non-fatal observations that route the case to a human (codes only, no PII). */
  flags: string[];
}

export type PassportValidation =
  | { ok: true; value: NormalisedPassport }
  | { ok: false; errors: ValidationIssue[] };

const GENERIC_NUMBER = /^[A-Z0-9]{5,20}$/;

export function normalisePassportNumber(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[\s\-/.]/g, '');
}

/** Normalises an issuing-state / nationality code: letters only, MRZ filler removed, max 3. */
export function normaliseCountryCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const code = String(raw).toUpperCase().replace(/[<\s]/g, '');
  return /^[A-Z]{1,3}$/.test(code) ? code : null;
}

/** Strict calendar-date parser for YYYY-MM-DD. */
export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function today(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** A passport is valid through its printed expiry date (inclusive). No extra validity margin is enforced. */
export function isPassportExpired(expiryIso: string, now: Date = new Date()): boolean {
  const exp = parseIsoDate(expiryIso);
  if (!exp) return true;
  return exp.getTime() < today(now);
}

const SPECIAL_LETTERS: Record<string, string> = {
  ß: 'SS', Æ: 'AE', Œ: 'OE', Ø: 'O', Đ: 'D', Ð: 'D', Þ: 'TH', Ł: 'L', İ: 'I', ı: 'I',
};

/** Upper-cases, removes diacritics and punctuation; order-agnostic token list. */
export function nameTokens(name: string): string[] {
  const folded = String(name ?? '')
    .replace(/[ßÆŒØĐÐÞŁİı]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ');
  return folded.split(/\s+/).filter(Boolean);
}

/**
 * Order-agnostic name comparison (surname/given order is not universal).
 * MATCH: same tokens. PARTIAL: one side's tokens are contained in the other's
 * (mononyms, dropped middle names, MRZ truncation). MISMATCH: otherwise.
 * Anything other than MATCH is sent to a human, never auto-rejected.
 */
export function compareNames(a: string, b: string, opts: { truncated?: boolean } = {}): MatchLevel {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 'UNKNOWN';
  const eq = (x: string, y: string) =>
    x === y || (opts.truncated === true && Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
  const contains = (hay: string[], needles: string[]) => needles.every((n) => hay.some((h) => eq(h, n)));
  const aInB = contains(tb, ta);
  const bInA = contains(ta, tb);
  if (aInB && bInA && ta.length === tb.length) return 'MATCH';
  if (aInB || bInA) return 'PARTIAL';
  return 'MISMATCH';
}

export function compareDates(a: string | null | undefined, b: string | null | undefined): 'MATCH' | 'MISMATCH' | 'UNKNOWN' {
  if (!a || !b) return 'UNKNOWN';
  return a === b ? 'MATCH' : 'MISMATCH';
}

const issue = (code: string, message: string, field?: string): ValidationIssue => ({ code, message, field });

export function validatePassport(input: PassportInput, ctx: PassportContext = {}): PassportValidation {
  const now = ctx.now ?? new Date();
  const errors: ValidationIssue[] = [];
  const flags: string[] = [];

  const number = normalisePassportNumber(input.number);
  if (!GENERIC_NUMBER.test(number)) {
    errors.push(
      issue('PASSPORT_NUMBER_INVALID', 'Enter the passport number exactly as printed (letters and digits, 5-20 characters).', 'passport.number'),
    );
  }

  const issuing = normaliseCountryCode(input.issuingCountry);
  if (!issuing) {
    errors.push(issue('ISSUING_COUNTRY_INVALID', 'Enter the issuing country code printed on the passport.', 'passport.issuingCountry'));
  } else if (issuing.length !== 3) {
    flags.push('NON_ISO_COUNTRY_CODE');
  }
  let nationality: string | null = null;
  if (input.nationality !== undefined && input.nationality !== null && input.nationality !== '') {
    nationality = normaliseCountryCode(input.nationality);
    if (!nationality) errors.push(issue('NATIONALITY_INVALID', 'Enter a valid nationality code.', 'passport.nationality'));
  }

  const dob = parseIsoDate(input.dateOfBirth);
  if (!dob) {
    errors.push(issue('DATE_OF_BIRTH_INVALID', 'Enter a real date of birth in YYYY-MM-DD format.', 'passport.dateOfBirth'));
  } else if (dob.getTime() > today(now)) {
    errors.push(issue('DATE_OF_BIRTH_FUTURE', 'The date of birth cannot be in the future.', 'passport.dateOfBirth'));
  }

  const expiry = parseIsoDate(input.expiryDate);
  if (!expiry) {
    errors.push(issue('EXPIRY_DATE_INVALID', 'Enter a real expiry date in YYYY-MM-DD format.', 'passport.expiryDate'));
  } else if (expiry.getTime() < today(now)) {
    errors.push(
      issue(
        'PASSPORT_EXPIRED',
        `This passport expired on ${input.expiryDate}. Upload a passport that is still valid.`,
        'passport.expiryDate',
      ),
    );
  }

  let issueDate: string | null = null;
  if (input.issueDate) {
    const issued = parseIsoDate(input.issueDate);
    if (!issued) {
      errors.push(issue('ISSUE_DATE_INVALID', 'Enter a real issue date in YYYY-MM-DD format.', 'passport.issueDate'));
    } else if (issued.getTime() > today(now)) {
      errors.push(issue('ISSUE_DATE_FUTURE', 'The issue date cannot be in the future.', 'passport.issueDate'));
    } else if (expiry && issued.getTime() > expiry.getTime()) {
      errors.push(issue('ISSUE_AFTER_EXPIRY', 'The issue date must be before the expiry date.', 'passport.issueDate'));
    } else {
      issueDate = input.issueDate;
    }
  }

  if (!nameTokens(input.legalName).length) {
    errors.push(issue('NAME_INVALID', 'Enter your full name as printed on the passport.', 'legalName'));
  }

  // ----- MRZ (optional input; local consistency checks only) -----
  let mrz: MrzResult | null = null;
  if (input.mrzLines && input.mrzLines.length) {
    try {
      mrz = parseMrz(input.mrzLines, now);
    } catch (err) {
      if (err instanceof MrzParseError) {
        errors.push(issue(err.code, 'The machine-readable zone could not be read. Re-check the lines or upload a clearer image.', 'passport.mrzLines'));
      } else {
        throw err;
      }
    }
  }
  if (mrz) {
    if (!mrz.documentCode.startsWith('P')) {
      errors.push(issue('MRZ_NOT_PASSPORT', 'The machine-readable zone is not from a passport.', 'passport.mrzLines'));
    }
    if (!mrz.valid) {
      errors.push(
        issue('MRZ_CHECK_DIGIT_FAILED', 'The machine-readable zone failed its check digits. Re-enter it or upload a clearer image.', 'passport.mrzLines'),
      );
    } else {
      const mrzNumber = normalisePassportNumber(mrz.documentNumber);
      if (mrzNumber !== number) errors.push(issue('MRZ_MISMATCH', 'The passport number does not match the machine-readable zone.', 'passport.number'));
      if (dob && mrz.dateOfBirthRaw !== input.dateOfBirth.slice(2, 4) + input.dateOfBirth.slice(5, 7) + input.dateOfBirth.slice(8, 10)) {
        errors.push(issue('MRZ_MISMATCH', 'The date of birth does not match the machine-readable zone.', 'passport.dateOfBirth'));
      }
      if (expiry && mrz.expiryDateRaw !== input.expiryDate.slice(2, 4) + input.expiryDate.slice(5, 7) + input.expiryDate.slice(8, 10)) {
        errors.push(issue('MRZ_MISMATCH', 'The expiry date does not match the machine-readable zone.', 'passport.expiryDate'));
      }
      const mrzIssuer = normaliseCountryCode(mrz.issuingState);
      if (issuing && mrzIssuer && mrzIssuer !== issuing) {
        errors.push(issue('MRZ_MISMATCH', 'The issuing country does not match the machine-readable zone.', 'passport.issuingCountry'));
      }
      const mrzNationality = normaliseCountryCode(mrz.nationality);
      if (nationality && mrzNationality && mrzNationality !== nationality) {
        errors.push(issue('MRZ_MISMATCH', 'The nationality does not match the machine-readable zone.', 'passport.nationality'));
      }
      if (!nationality && mrzNationality) nationality = mrzNationality;
    }
  } else {
    flags.push('MRZ_NOT_PROVIDED');
  }

  if (errors.length) return { ok: false, errors };

  // ----- Soft comparisons: uncertainty goes to manual review, never to rejection -----
  let nameMatch = compareNames(input.legalName, `${mrz?.givenNames ?? ''} ${mrz?.surname ?? ''}`.trim() || input.legalName, {
    truncated: mrz?.nameTruncated,
  });
  if (!mrz) nameMatch = 'UNKNOWN';
  if (ctx.accountName) {
    const accountMatch = compareNames(input.legalName, ctx.accountName);
    if (accountMatch === 'MISMATCH') flags.push('NAME_ACCOUNT_MISMATCH');
    else if (accountMatch === 'PARTIAL' || accountMatch === 'UNKNOWN') flags.push('NAME_ACCOUNT_PARTIAL');
    if (!mrz) nameMatch = accountMatch;
  }
  if (nameMatch === 'MISMATCH') flags.push('NAME_MISMATCH');
  if (nameMatch === 'PARTIAL') flags.push('NAME_PARTIAL');

  const dobMatch = compareDates(input.dateOfBirth, ctx.profileDob ?? null);
  if (dobMatch === 'MISMATCH') flags.push('DOB_PROFILE_MISMATCH');

  return {
    ok: true,
    value: {
      number,
      last4: number.slice(-4),
      issuingCountry: issuing as string,
      nationality,
      holderName: input.legalName.trim(),
      dateOfBirth: input.dateOfBirth,
      issueDate,
      expiryDate: input.expiryDate,
      mrz: mrz
        ? {
            format: mrz.format,
            checks: { ...mrz.checks } as Record<string, boolean | null>,
            allValid: mrz.valid,
          }
        : null,
      nameMatch,
      dobMatch,
      extractionSource: mrz ? 'LOCAL_MRZ' : 'USER',
      flags,
    },
  };
}

