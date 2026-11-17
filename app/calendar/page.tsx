'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { formatMonthParam, generateCalendarGrid, isValidMonthParam, resolveMonthParam, shiftMonth } from '@/lib/calendar';
import { PRIORITY_BADGE_CLASS } from '@/lib/constants';
import type { Holiday, Todo } from '@/lib/types';

export default function CalendarPage() {
  return (
    <Suspense fallback={<p className="p-6">Loading calendar…</p>}>
      <CalendarView />
    </Suspense>
  );
}

function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawMonth = searchParams.get('month');
  const resolved = resolveMonthParam(rawMonth);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (rawMonth && !isValidMonthParam(rawMonth)) {
      router.replace(`/calendar?month=${formatMonthParam(resolved.year, resolved.month)}`);
    }
  }, [rawMonth, resolved.year, resolved.month, router]);

  useEffect(() => {
    void Promise.all([
      fetch('/api/todos').then((response) => response.json()),
      fetch('/api/holidays').then((response) => response.json()),
    ]).then(([todoData, holidayData]: [{ todos: Todo[] }, { holidays: Holiday[] }]) => {
      setTodos(todoData.todos ?? []);
      setHolidays(holidayData.holidays ?? []);
    });
  }, []);

  const cells = useMemo(() => generateCalendarGrid(resolved.year, resolved.month), [resolved.year, resolved.month]);
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));

  function go(delta: number) {
    const next = shiftMonth(resolved.year, resolved.month, delta);
    router.push(`/calendar?month=${formatMonthParam(next.year, next.month)}`);
  }

  const selectedTodos = selectedDate
    ? todos.filter((todo) => todo.due_date?.slice(0, 10) === selectedDate)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p data-testid="month-label" className="text-sm text-zinc-600 dark:text-zinc-400">{resolved.label}</p>
        </div>
        <div className="flex gap-2">
          <Link data-testid="home-link" href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Todos</Link>
          <button type="button" data-testid="calendar-prev" onClick={() => go(-1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Previous</button>
          <button type="button" data-testid="calendar-next" onClick={() => go(1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Next</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div data-testid="calendar-grid" className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dayTodos = todos.filter((todo) => todo.due_date?.slice(0, 10) === cell.date);
          const visible = dayTodos.slice(0, 3);
          const overflow = dayTodos.length - visible.length;
          const holiday = holidayByDate.get(cell.date);
          return (
            <button
              key={cell.date}
              type="button"
              data-testid="calendar-cell"
              data-date={cell.date}
              data-today={cell.isToday ? 'true' : 'false'}
              data-past={cell.isPast ? 'true' : 'false'}
              data-weekend={cell.isWeekend ? 'true' : 'false'}
              data-in-month={cell.inMonth ? 'true' : 'false'}
              onClick={() => setSelectedDate(cell.date)}
              className={`min-h-24 rounded-lg border p-1 text-left text-xs ${cell.inMonth ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900' : 'border-transparent opacity-40'} ${cell.isToday ? 'ring-2 ring-blue-500' : ''} ${cell.isWeekend ? 'text-rose-700 dark:text-rose-300' : ''}`}
            >
              <span className="font-semibold">{cell.day}</span>
              {holiday ? <span data-testid="holiday-name" className="mt-1 block truncate text-[10px] font-medium text-emerald-800 dark:text-emerald-200">{holiday}</span> : null}
              {visible.map((todo) => (
                <span key={todo.id} className={`mt-1 block truncate rounded px-1 text-black ${PRIORITY_BADGE_CLASS[todo.priority]}`}>{todo.title}</span>
              ))}
              {overflow > 0 ? <span data-testid="overflow-count" className="mt-1 inline-block rounded bg-zinc-800 px-1 text-white">+{overflow}</span> : null}
            </button>
          );
        })}
      </div>
      {selectedDate ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Todos on ${selectedDate}`}>
          <div data-testid="day-modal" className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selectedDate}</h2>
              <button type="button" data-testid="close-day-modal" onClick={() => setSelectedDate(null)}>Close</button>
            </div>
            {holidayByDate.get(selectedDate) ? <p className="mt-2 text-sm">{holidayByDate.get(selectedDate)}</p> : null}
            <ul className="mt-3 space-y-2">
              {selectedTodos.length === 0 ? <li className="text-sm text-zinc-500">No todos</li> : null}
              {selectedTodos.map((todo) => (
                <li key={todo.id} className={`rounded px-2 py-1 text-sm text-black ${PRIORITY_BADGE_CLASS[todo.priority]}`}>{todo.title}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}
