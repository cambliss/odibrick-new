/**
 * ICAO Doc 9303 machine-readable zone parser (TD1, TD2, TD3).
 *
 * IMPORTANT LIMITS
 *  - A valid MRZ (correct format + check digits) only proves the text is
 *    internally consistent. It is NOT proof that a passport is genuine.
 *  - The raw MRZ lines are never returned or stored: callers get parsed fields
 *    and per-check booleans only.
 */

export type MrzFormat = 'TD1' | 'TD2' | 'TD3';

export interface MrzChecks {
  documentNumber: boolean;
  dateOfBirth: boolean;
  expiryDate: boolean;
  /** null when the optional/personal-number field is empty (check digit may be '<' or '0'). */
  optionalData: boolean | null;
  composite: boolean;
}

export interface MrzResult {
  format: MrzFormat;
  /** First character is 'P' for passports. */
  documentCode: string;
  issuingState: string;
  nationality: string;
  documentNumber: string;
  /** Document number continued into the optional-data field (ICAO overflow rule). */
  overflow: boolean;
  surname: string;
  givenNames: string;
  /** True when the name field is completely filled, so the name may be cut off. */
  nameTruncated: boolean;
  sex: 'M' | 'F' | 'X';
  dateOfBirth: string | null;
  expiryDate: string | null;
  /** YYMMDD as printed, for century-agnostic comparisons. */
  dateOfBirthRaw: string;
  expiryDateRaw: string;
  checks: MrzChecks;
  /** All applicable check digits passed. */
  valid: boolean;
}

export class MrzParseError extends Error {
  constructor(readonly code: 'MRZ_FORMAT' | 'MRZ_CHARACTERS' | 'MRZ_LINE_LENGTH', message: string) {
    super(message);
  }
}

const WEIGHTS = [7, 3, 1];

function charValue(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0; // '<' filler
}

/** ICAO 9303 check digit (weights 7-3-1). */
export function checkDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += charValue(field[i]) * WEIGHTS[i % 3];
  return sum % 10;
}

function digitMatches(field: string, checkChar: string): boolean {
  if (!/^[0-9]$/.test(checkChar)) return false;
  return checkDigit(field) === Number(checkChar);
}

function optionalCheck(field: string, checkChar: string): boolean | null {
  const empty = /^<*$/.test(field);
  if (empty) return checkChar === '<' || checkChar === '0' ? null : false;
  return digitMatches(field, checkChar);
}

export function normaliseMrzLines(lines: string[]): string[] {
  return lines.map((l) => String(l ?? '').toUpperCase().replace(/\s+/g, ''));
}

/** YYMMDD -> ISO date. kind decides the century rule. Returns null for impossible dates. */
export function mrzDateToIso(yymmdd: string, kind: 'BIRTH' | 'EXPIRY', now: Date = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const currentYear = now.getUTCFullYear();
  let year = 2000 + yy;
  if (kind === 'BIRTH') {
    // A birth date cannot be in the future: roll back a century if needed.
    if (Date.UTC(year, mm - 1, dd) > now.getTime()) year -= 100;
  } else if (year - currentYear > 20) {
    // Passport validity is at most ~10-15 years: a "20YY" far in the future means 19YY.
    year -= 100;
  }
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${String(year).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function parseNames(field: string): { surname: string; givenNames: string; truncated: boolean } {
  const truncated = !field.endsWith('<');
  const trimmed = field.replace(/<+$/, '');
  const idx = trimmed.indexOf('<<');
  const primary = idx === -1 ? trimmed : trimmed.slice(0, idx);
  const secondary = idx === -1 ? '' : trimmed.slice(idx + 2);
  const clean = (s: string) => s.replace(/<+/g, ' ').trim();
  return { surname: clean(primary), givenNames: clean(secondary), truncated };
}

function sexOf(ch: string): 'M' | 'F' | 'X' {
  return ch === 'M' ? 'M' : ch === 'F' ? 'F' : 'X';
}

/**
 * Resolves the document number including the overflow rule: when the check
 * character after the 9-character number field is '<', the number continues in
 * the optional-data field, terminated by its own check digit.
 */
function resolveNumber(
  field9: string,
  checkChar: string,
  optionalField: string,
): { number: string; check: boolean; overflow: boolean } {
  if (checkChar !== '<') {
    return {
      number: field9.replace(/<+$/, ''),
      check: digitMatches(field9, checkChar),
      overflow: false,
    };
  }
  const trimmed = optionalField.replace(/<+$/, '');
  if (trimmed.length < 2) return { number: field9.replace(/<+$/, ''), check: false, overflow: true };
  const rest = trimmed.slice(0, -1);
  const overflowCheck = trimmed.slice(-1);
  const full = field9 + rest;
  return { number: full.replace(/<+/g, ''), check: digitMatches(full, overflowCheck), overflow: true };
}

export function parseMrz(rawLines: string[], now: Date = new Date()): MrzResult {
  if (!Array.isArray(rawLines) || rawLines.length < 2 || rawLines.length > 3) {
    throw new MrzParseError('MRZ_FORMAT', 'An MRZ has two or three lines.');
  }
  const lines = normaliseMrzLines(rawLines);
  if (lines.some((l) => !/^[A-Z0-9<]+$/.test(l))) {
    throw new MrzParseError('MRZ_CHARACTERS', 'The MRZ may only contain A-Z, 0-9 and "<".');
  }

  const lengths = lines.map((l) => l.length).join(',');
  if (lines.length === 3 && lengths === '30,30,30') return parseTd1(lines, now);
  if (lines.length === 2 && lengths === '36,36') return parseTd2(lines, now);
  if (lines.length === 2 && lengths === '44,44') return parseTd3(lines, now);
  throw new MrzParseError('MRZ_LINE_LENGTH', 'The MRZ line lengths do not match TD1 (3x30), TD2 (2x36) or TD3 (2x44).');
}

function parseTd3(lines: string[], now: Date): MrzResult {
  const [l1, l2] = lines;
  const num = resolveNumber(l2.slice(0, 9), l2[9], l2.slice(28, 42));
  const dobField = l2.slice(13, 19);
  const expField = l2.slice(21, 27);
  const personal = l2.slice(28, 42);
  const dobOk = digitMatches(dobField, l2[19]);
  const expOk = digitMatches(expField, l2[27]);
  const optOk = num.overflow ? null : optionalCheck(personal, l2[42]);
  const composite = digitMatches(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43), l2[43]);
  const names = parseNames(l1.slice(5, 44));
  const checks: MrzChecks = {
    documentNumber: num.check,
    dateOfBirth: dobOk,
    expiryDate: expOk,
    optionalData: optOk,
    composite,
  };
  return build('TD3', l1.slice(0, 2), l1.slice(2, 5), l2.slice(10, 13), num, names, l2[20], dobField, expField, checks, now);
}

function parseTd2(lines: string[], now: Date): MrzResult {
  const [l1, l2] = lines;
  const num = resolveNumber(l2.slice(0, 9), l2[9], l2.slice(28, 35));
  const dobField = l2.slice(13, 19);
  const expField = l2.slice(21, 27);
  const dobOk = digitMatches(dobField, l2[19]);
  const expOk = digitMatches(expField, l2[27]);
  const composite = digitMatches(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35), l2[35]);
  const names = parseNames(l1.slice(5, 36));
  const checks: MrzChecks = {
    documentNumber: num.check,
    dateOfBirth: dobOk,
    expiryDate: expOk,
    optionalData: null,
    composite,
  };
  return build('TD2', l1.slice(0, 2), l1.slice(2, 5), l2.slice(10, 13), num, names, l2[20], dobField, expField, checks, now);
}

function parseTd1(lines: string[], now: Date): MrzResult {
  const [l1, l2, l3] = lines;
  const num = resolveNumber(l1.slice(5, 14), l1[14], l1.slice(15, 30));
  const dobField = l2.slice(0, 6);
  const expField = l2.slice(8, 14);
  const dobOk = digitMatches(dobField, l2[6]);
  const expOk = digitMatches(expField, l2[14]);
  const composite = digitMatches(
    l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29),
    l2[29],
  );
  const names = parseNames(l3);
  const checks: MrzChecks = {
    documentNumber: num.check,
    dateOfBirth: dobOk,
    expiryDate: expOk,
    optionalData: null,
    composite,
  };
  return build('TD1', l1.slice(0, 2), l1.slice(2, 5), l2.slice(15, 18), num, names, l2[7], dobField, expField, checks, now);
}

function build(
  format: MrzFormat,
  documentCode: string,
  issuing: string,
  nationality: string,
  num: { number: string; overflow: boolean },
  names: { surname: string; givenNames: string; truncated: boolean },
  sex: string,
  dobRaw: string,
  expRaw: string,
  checks: MrzChecks,
  now: Date,
): MrzResult {
  const strip = (s: string) => s.replace(/<+$/g, '').replace(/</g, '');
  const dateOfBirth = mrzDateToIso(dobRaw, 'BIRTH', now);
  const expiryDate = mrzDateToIso(expRaw, 'EXPIRY', now);
  const valid =
    checks.documentNumber &&
    checks.dateOfBirth &&
    checks.expiryDate &&
    checks.optionalData !== false &&
    checks.composite &&
    dateOfBirth !== null &&
    expiryDate !== null;
  return {
    format,
    documentCode: documentCode.replace(/</g, ''),
    issuingState: strip(issuing),
    nationality: strip(nationality),
    documentNumber: num.number,
    overflow: num.overflow,
    surname: names.surname,
    givenNames: names.givenNames,
    nameTruncated: names.truncated,
    sex: sexOf(sex),
    dateOfBirth,
    expiryDate,
    dateOfBirthRaw: dobRaw,
    expiryDateRaw: expRaw,
    checks,
    valid,
  };
}

