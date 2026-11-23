/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NavTab } from '../components/Navbar';

export type NotificationCategory = 'elo' | 'sync' | 'security' | 'system';

export interface AppNotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info';
  category: NotificationCategory;
  createdAt: number;
  read: boolean;
  targetTab?: NavTab;
}

export interface MobileNotificationPrefs {
  dnd: boolean;
  haptic: boolean;
  autoHideSeconds: 4 | 6 | 8 | 0;
  categories: Record<NotificationCategory, boolean>;
}

const NOTIF_HISTORY_KEY = 'roadto2000_notif_history_v1';
const NOTIF_PREFS_KEY = 'roadto2000_notif_prefs_v1';
const MAX_STORED_NOTIFS = 40;

export const DEFAULT_MOBILE_NOTIF_PREFS: MobileNotificationPrefs = {
  dnd: false,
  haptic: true,
  autoHideSeconds: 6,
  categories: {
    elo: true,
    sync: true,
    security: true,
    system: true,
  },
};

export function getNotificationPrefs(): MobileNotificationPrefs {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          dnd: Boolean(parsed?.dnd),
          haptic: parsed?.haptic !== false,
          autoHideSeconds:
            parsed?.autoHideSeconds === 0 ||
            parsed?.autoHideSeconds === 4 ||
            parsed?.autoHideSeconds === 6 ||
            parsed?.autoHideSeconds === 8
              ? parsed.autoHideSeconds
              : 6,
          categories: {
            elo: parsed?.categories?.elo !== false,
            sync: parsed?.categories?.sync !== false,
            security: parsed?.categories?.security !== false,
            system: parsed?.categories?.system !== false,
          },
        };
      }
    }
  } catch {}
  return {
    dnd: false,
    haptic: true,
    autoHideSeconds: 6,
    categories: { elo: true, sync: true, security: true, system: true },
  };
}

export function saveNotificationPrefs(prefs: MobileNotificationPrefs): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
    }
  } catch {}
}

export function getStoredNotifications(): AppNotificationItem[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(NOTIF_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_STORED_NOTIFS);
        }
      }
    }
  } catch {}
  return [];
}

export function saveStoredNotifications(items: AppNotificationItem[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        NOTIF_HISTORY_KEY,
        JSON.stringify(items.slice(0, MAX_STORED_NOTIFS))
      );
    }
  } catch {}
}

export function inferNotificationMeta(
  title: string,
  message: string
): { category: NotificationCategory; targetTab?: NavTab } {
  const haystack = `${title} ${message}`.toLowerCase();

  if (
    haystack.includes('a2f') ||
    haystack.includes('2fa') ||
    haystack.includes('admin') ||
    haystack.includes('pause') ||
    haystack.includes('session') ||
    haystack.includes('verrouill')
  ) {
    return {
      category: 'security',
      targetTab: haystack.includes('pause') || haystack.includes('activité') ? 'admin' : undefined,
    };
  }

  if (
    haystack.includes('jsonbin') ||
    haystack.includes('sync') ||
    haystack.includes('cloud') ||
    haystack.includes('cache') ||
    haystack.includes('chess.com') ||
    haystack.includes('relevé')
  ) {
    return {
      category: 'sync',
      targetTab: 'history',
    };
  }

  if (
    haystack.includes('elo') ||
    haystack.includes('sommet') ||
    haystack.includes('record') ||
    haystack.includes('objectif') ||
    haystack.includes('problème')
  ) {
    return {
      category: 'elo',
      targetTab: 'charts',
    };
  }

  return { category: 'system' };
}

export function triggerNotificationHaptic(type: 'success' | 'warning' | 'info' | 'tap'): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (type === 'warning') {
      navigator.vibrate([18, 35, 18]);
    } else if (type === 'success') {
      navigator.vibrate([12, 24, 16]);
    } else if (type === 'tap') {
      navigator.vibrate(6);
    } else {
      navigator.vibrate(10);
    }
  } catch {}
}

export function formatRelativeNotificationTime(ts: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 45) return "À l'instant";
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `Il y a ${mins} min`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `Il y a ${hrs} h`;
  }
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  elo: 'Elo & Objectifs',
  sync: 'Sync & JSONBin',
  security: 'Sécurité & Site',
  system: 'Système',
};
