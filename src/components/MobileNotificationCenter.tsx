/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  Info,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Vibrate,
  X,
} from 'lucide-react';
import {
  AppNotificationItem,
  formatRelativeNotificationTime,
  MobileNotificationPrefs,
  NOTIFICATION_CATEGORY_LABEL,
  NotificationCategory,
} from '../utils/notifications';
import { NavTab } from './Navbar';

interface MobileNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotificationItem[];
  prefs: MobileNotificationPrefs;
  onUpdatePrefs: (next: MobileNotificationPrefs) => void;
  onMarkAllRead: () => void;
  onMarkOneRead: (id: string) => void;
  onDeleteOne: (id: string) => void;
  onClearAll: () => void;
  onNavigateTab: (tab: NavTab) => void;
  onSendTestNotification: () => void;
}

export const MobileNotificationCenter: React.FC<MobileNotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  prefs,
  onUpdatePrefs,
  onMarkAllRead,
  onMarkOneRead,
  onDeleteOne,
  onClearAll,
  onNavigateTab,
  onSendTestNotification,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'alerts' | 'settings'>('all');

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const filteredList = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'alerts') return notifications.filter((n) => n.type === 'warning');
    return notifications;
  }, [notifications, filter]);

  if (!isOpen) return null;

  const iconForType = (type: AppNotificationItem['type']) => {
    if (type === 'success') return <CheckCircle2 className="h-4 w-4 text-[#10b981]" />;
    if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-[#ef4444]" />;
    return <Info className="h-4 w-4 text-[#facc15]" />;
  };

  const iconBgForType = (type: AppNotificationItem['type']) => {
    if (type === 'success') return 'bg-[#10b981]/15 border-[#10b981]/30';
    if (type === 'warning') return 'bg-[#ef4444]/15 border-[#ef4444]/30';
    return 'bg-[#facc15]/15 border-[#facc15]/30';
  };

  return (
    <div
      className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[86vh] flex flex-col rounded-t-[30px] sm:rounded-3xl border border-white/[0.15] bg-[#0a0e16]/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-18px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22)] overflow-hidden text-left"
      >
        {/* Mobile Drag Handle Bar */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1.5 rounded-full bg-white/25" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-[#facc15]/15 border border-[#facc15]/30 flex items-center justify-center text-[#facc15] shrink-0">
              {prefs.dnd ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white leading-tight truncate">
                Centre de Notifications
              </h2>
              <p className="text-[11px] text-neutral-400">
                {unreadCount > 0 ? `${unreadCount} non lue(s)` : 'Tout est lu'} ·{' '}
                {prefs.dnd ? 'Mode silencieux actif' : 'Bannières actives'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center text-neutral-300 hover:text-white transition-colors shrink-0"
            aria-label="Fermer les notifications"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter & Settings Bar */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            {(
              [
                { id: 'all', label: `Toutes (${notifications.length})` },
                { id: 'unread', label: `Non lues (${unreadCount})` },
                { id: 'alerts', label: 'Alertes' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-[#facc15] text-black font-bold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFilter((f) => (f === 'settings' ? 'all' : 'settings'))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              filter === 'settings'
                ? 'border-[#facc15] bg-[#facc15]/15 text-[#facc15]'
                : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Réglages</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filter === 'settings' ? (
            <div className="space-y-4">
              {/* Mobile Notification Toggles */}
              <div className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] cursor-pointer">
                  <div className="flex items-center gap-3">
                    <BellOff className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-white">Mode Silencieux (Ne pas déranger)</div>
                      <div className="text-[11px] text-neutral-400">
                        Enregistre ici sans afficher de bannière flottante
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.dnd}
                    onChange={(e) => onUpdatePrefs({ ...prefs, dnd: e.target.checked })}
                    className="h-5 w-5 accent-[#facc15]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Vibrate className="h-4 w-4 text-[#10b981] shrink-0" />
                    <div>
                      <div className="font-bold text-white">Retour tactile (Vibration)</div>
                      <div className="text-[11px] text-neutral-400">
                        Vibre doucement lors des notifications et du glissement du dock
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.haptic}
                    onChange={(e) => onUpdatePrefs({ ...prefs, haptic: e.target.checked })}
                    className="h-5 w-5 accent-[#10b981]"
                  />
                </label>

                <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] space-y-2">
                  <div className="font-bold text-white">Durée d&apos;affichage des bannières</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([4, 6, 8, 0] as const).map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onUpdatePrefs({ ...prefs, autoHideSeconds: sec })}
                        className={`py-2 rounded-xl border text-xs font-bold transition-colors ${
                          prefs.autoHideSeconds === sec
                            ? 'border-[#facc15] bg-[#facc15]/20 text-[#facc15]'
                            : 'border-white/10 bg-black/30 text-neutral-300'
                        }`}
                      >
                        {sec === 0 ? 'Fixe' : `${sec} s`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] space-y-2">
                  <div className="font-bold text-white mb-1">Catégories actives sur mobile</div>
                  {(Object.keys(NOTIFICATION_CATEGORY_LABEL) as NotificationCategory[]).map((cat) => (
                    <label
                      key={cat}
                      className="flex items-center justify-between py-1.5 cursor-pointer"
                    >
                      <span className="text-neutral-200">{NOTIFICATION_CATEGORY_LABEL[cat]}</span>
                      <input
                        type="checkbox"
                        checked={prefs.categories[cat]}
                        onChange={(e) =>
                          onUpdatePrefs({
                            ...prefs,
                            categories: { ...prefs.categories, [cat]: e.target.checked },
                          })
                        }
                        className="h-4 w-4 accent-[#facc15]"
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onSendTestNotification}
                  className="w-full py-3 px-4 rounded-2xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Tester une notification mobile maintenant</span>
                </button>
              </div>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-500">
                <Bell className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-neutral-300">Aucune notification ici</p>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Vos alertes de progression Elo, synchronisations JSONBin et événements de sécurité apparaîtront ici.
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.id}
                onClick={() => onMarkOneRead(item.id)}
                className={`rounded-2xl border p-3.5 transition-colors cursor-pointer ${
                  item.read
                    ? 'border-white/[0.07] bg-white/[0.02] opacity-80'
                    : 'border-[#facc15]/30 bg-[#facc15]/[0.06]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${iconBgForType(
                      item.type
                    )}`}
                  >
                    {iconForType(item.type)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate">{item.title}</span>
                      <span className="text-[10px] font-mono text-neutral-400 shrink-0 tabular-nums">
                        {formatRelativeNotificationTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-300 leading-snug">{item.message}</p>

                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-neutral-400">
                      <span>{NOTIFICATION_CATEGORY_LABEL[item.category]}</span>

                      <div className="flex items-center gap-3">
                        {item.targetTab && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkOneRead(item.id);
                              onNavigateTab(item.targetTab!);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 font-bold text-[#facc15] hover:underline"
                          >
                            <span>Ouvrir</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteOne(item.id);
                          }}
                          className="text-neutral-500 hover:text-[#ef4444] p-1"
                          aria-label="Supprimer cette notification"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {filter !== 'settings' && notifications.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.08] bg-black/30 flex items-center justify-between gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-neutral-200 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5 text-[#10b981]" />
              <span>Tout marquer lu</span>
            </button>

            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-xs font-semibold text-[#ef4444]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Tout effacer</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
