import { addDays, daysInMonth, singaporeToday, singaporeWeekday } from './timezone';

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatMonthParam(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function isValidMonthParam(raw: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(raw)) return false;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

export function resolveMonthParam(raw: string | null, today = singaporeToday()): { year: number; month: number; label: string } {
  const fallbackYear = Number(today.slice(0, 4));
  const fallbackMonth = Number(today.slice(5, 7));
  if (!raw || !isValidMonthParam(raw)) {
    return { year: fallbackYear, month: fallbackMonth, label: monthLabel(fallbackYear, fallbackMonth) };
  }
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  return { year, month, label: monthLabel(year, month) };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function generateCalendarGrid(year: number, month: number, today = singaporeToday()): CalendarCell[] {
  const first = `${year}-${pad(month)}-01`;
  const lead = singaporeWeekday(first);
  const start = addDays(first, -lead);
  const occupied = lead + daysInMonth(year, month);
  const cellCount = occupied <= 35 ? 35 : 42;
  const monthKey = `${year}-${pad(month)}`;
  const cells: CalendarCell[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const date = addDays(start, index);
    const weekday = singaporeWeekday(date);
    cells.push({
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.slice(0, 7) === monthKey,
      isToday: date === today,
      isPast: date < today,
      isWeekend: weekday === 0 || weekday === 6,
    });
  }
  return cells;
}
