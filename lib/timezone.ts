import type { RecurrencePattern } from './types';

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getSingaporeNow(): Date {
  return new Date();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function partsFromDate(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(hour),
    minute: Number(pick('minute')),
    second: Number(pick('second')),
  };
}

function formatParts(parts: DateParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function formatSingaporeDate(date: Date): string {
  return formatParts(partsFromDate(date));
}

export function formatSingaporeDateOnly(date: Date): string {
  return formatSingaporeDate(date).slice(0, 10);
}

export function nowIso(): string {
  return formatSingaporeDate(getSingaporeNow());
}

export function singaporeToday(): string {
  return formatSingaporeDateOnly(getSingaporeNow());
}

export function parseSingaporeDateTime(value: string): Date {
  const trimmed = value.trim();
  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized = `${normalized}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) normalized = `${normalized}:00`;
  normalized = normalized.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  return new Date(`${normalized}+08:00`);
}

export function normalizeStoredDateTime(value: string): string {
  const parsed = parseSingaporeDateTime(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date');
  }
  return formatSingaporeDate(parsed);
}

export function isValidStoredDateTime(value: string): boolean {
  const parsed = parseSingaporeDateTime(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return formatSingaporeDate(parsed) === normalizeQuiet(value);
}

function normalizeQuiet(value: string): string {
  try {
    return normalizeStoredDateTime(value);
  } catch {
    return '';
  }
}

export function addMinutes(iso: string, minutes: number): string {
  const parsed = parseSingaporeDateTime(iso);
  return formatSingaporeDate(new Date(parsed.getTime() + minutes * 60_000));
}

export function addDays(dateOnly: string, days: number): string {
  const parsed = parseSingaporeDateTime(`${dateOnly}T12:00:00`);
  return formatSingaporeDate(new Date(parsed.getTime() + days * 86_400_000)).slice(0, 10);
}

export function singaporeWeekday(dateOnly: string): number {
  const parsed = parseSingaporeDateTime(`${dateOnly}T12:00:00`);
  return parsed.getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isDueDateFarEnough(due: string, now: Date = getSingaporeNow()): boolean {
  const parsed = parseSingaporeDateTime(due);
  if (Number.isNaN(parsed.getTime())) return false;
  const minimum = addMinutes(formatSingaporeDate(now), 1);
  return normalizeStoredDateTime(due) >= minimum;
}

function shiftMonths(parts: DateParts, delta: number): DateParts {
  const index = parts.year * 12 + (parts.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { ...parts, year, month, day };
}

export function calculateNextDueDate(current: string, pattern: RecurrencePattern): string {
  const normalized = normalizeStoredDateTime(current);
  const parsed = parseSingaporeDateTime(normalized);
  const parts = partsFromDate(parsed);
  if (pattern === 'daily') {
    return formatSingaporeDate(new Date(parsed.getTime() + 86_400_000));
  }
  if (pattern === 'weekly') {
    return formatSingaporeDate(new Date(parsed.getTime() + 7 * 86_400_000));
  }
  if (pattern === 'monthly') return formatParts(shiftMonths(parts, 1));
  return formatParts(shiftMonths(parts, 12));
}
