'use client';

import { useEffect } from 'react';

interface DueNotification {
  id: number;
  title: string;
  body: string;
  sent_at: string;
}

const claimedIds = new Set<number>();

export function useNotifications(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    async function poll() {
      try {
        const response = await fetch('/api/notifications/check');
        if (!response.ok) return;
        const data = (await response.json()) as { notifications: DueNotification[] };
        for (const note of data.notifications) {
          if (claimedIds.has(note.id)) continue;
          claimedIds.add(note.id);
          try {
            if (typeof Notification !== 'undefined') {
              if (Notification.permission === 'default') await Notification.requestPermission();
              if (Notification.permission === 'granted') new Notification(note.title, { body: note.body });
            }
          } catch {
            // Browser notification support is optional.
          }
          const recorder = window as Window & { __notes?: { title: string; body: string }[] };
          if (recorder.__notes) recorder.__notes.push({ title: note.title, body: note.body });
          await fetch(`/api/todos/${note.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_notification_sent: note.sent_at }),
          });
        }
      } catch {
        // Polling is best-effort; the next interval retries.
      }
    }

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, [enabled]);
}
