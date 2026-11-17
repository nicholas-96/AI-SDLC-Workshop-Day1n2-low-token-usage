import type { Priority, ReminderMinutes } from './types';

export const REMINDER_OPTIONS: { minutes: ReminderMinutes; label: string }[] = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 1440, label: '1d' },
  { minutes: 2880, label: '2d' },
  { minutes: 10080, label: '1w' },
];

export const REMINDER_VALUES: readonly ReminderMinutes[] = REMINDER_OPTIONS.map((option) => option.minutes);

export function reminderLabel(minutes: number): string {
  return REMINDER_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `${minutes}m`;
}

export const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  high: 'bg-[#EF4444] text-black dark:bg-[#F87171]',
  medium: 'bg-[#F59E0B] text-black dark:bg-[#FBBF24]',
  low: 'bg-[#3B82F6] text-black dark:bg-[#60A5FA]',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
