/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Info, X } from 'lucide-react';
import {
  formatRelativeNotificationTime,
  NOTIFICATION_CATEGORY_LABEL,
  NotificationCategory,
} from '../utils/notifications';
import type { NavTab } from './Navbar';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'info';
  category?: NotificationCategory;
  createdAt?: number;
  durationMs?: number;
  targetTab?: NavTab;
}

interface NotificationToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
  onOpenCenter?: () => void;
  onNavigateTab?: (tab: NavTab) => void;
}

interface ToastCardProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
  onOpenCenter?: () => void;
  onNavigateTab?: (tab: NavTab) => void;
}

const SwipeableToastCard: React.FC<ToastCardProps> = ({
  toast,
  onDismiss,
  onOpenCenter,
  onNavigateTab,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dragRef = useRef<{ active: boolean; startX: number; moved: boolean }>({
    active: false,
    startX: 0,
    moved: false,
  });

  const triggerDismiss = (direction = 0) => {
    if (isClosing) return;
    setIsClosing(true);
    setIsSwiping(false);
    if (direction !== 0) {
      setOffsetX(direction > 0 ? 320 : -320);
    }
    window.setTimeout(() => {
      onDismiss(toast.id);
    }, 180);
  };

  useEffect(() => {
    if (toast.durationMs === 0) return;
    const ms = toast.durationMs || 6000;
    const timer = window.setTimeout(() => {
      setIsClosing(true);
      window.setTimeout(() => {
        onDismiss(toast.id);
      }, 180);
    }, Math.max(250, ms - 180));
    return () => window.clearTimeout(timer);
  }, [toast.durationMs, toast.id, onDismiss]);

  const type = toast.type || 'info';

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-[#10b981]" />,
    warning: <AlertCircle className="h-4 w-4 text-[#ef4444]" />,
    info: <Info className="h-4 w-4 text-[#facc15]" />,
  };

  const iconContainer = {
    success: 'bg-[#10b981]/15 border-[#10b981]/35',
    warning: 'bg-[#ef4444]/15 border-[#ef4444]/35',
    info: 'bg-[#facc15]/15 border-[#facc15]/35',
  };

  const borderTint = {
    success: 'border-[#10b981]/35',
    warning: 'border-[#ef4444]/40',
    info: 'border-white/20',
  };

  const progressTint = {
    success: 'bg-[#10b981]',
    warning: 'bg-[#ef4444]',
    info: 'bg-[#facc15]',
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || isClosing) return;
    dragRef.current = { active: true, startX: e.clientX, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || isClosing) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 6) {
      dragRef.current.moved = true;
      setIsSwiping(true);
    }
    if (dragRef.current.moved) {
      setOffsetX(dx);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    setIsSwiping(false);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (wasMoved && Math.abs(dx) > 75) {
      triggerDismiss(dx > 0 ? 1 : -1);
      return;
    }

    setOffsetX(0);

    if (!wasMoved) {
      if (toast.targetTab && onNavigateTab) {
        onNavigateTab(toast.targetTab);
        triggerDismiss(0);
      } else if (onOpenCenter) {
        onOpenCenter();
        triggerDismiss(0);
      }
    }
  };

  const opacity = isClosing ? 0 : Math.max(0.25, 1 - Math.abs(offsetX) / 190);
  const categoryText = toast.category
    ? NOTIFICATION_CATEGORY_LABEL[toast.category]
    : 'Notification';

  return (
    <div style={{ animation: 'roadto2000ToastIn 260ms cubic-bezier(0.22, 1, 0.36, 1) forwards' }}>
      <div
        role="status"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={() => {
          dragRef.current.active = false;
          setIsSwiping(false);
          setOffsetX(0);
        }}
        style={{
          transform: isClosing && offsetX === 0
            ? 'translate3d(0, -10px, 0) scale(0.95)'
            : `translate3d(${offsetX}px, 0, 0)`,
          opacity,
          transition: isSwiping
            ? 'none'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
        }}
        className={`pointer-events-auto relative overflow-hidden rounded-[22px] border ${borderTint[type]} bg-[#0c0f14] shadow-2xl touch-pan-y cursor-pointer`}
      >
        <div className="p-3.5 flex items-start gap-3">
          <div
            className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${iconContainer[type]}`}
          >
            {icons[type]}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
              <span className="font-semibold truncate">{categoryText}</span>
              <span className="font-mono shrink-0 tabular-nums">
                {toast.createdAt ? formatRelativeNotificationTime(toast.createdAt) : "À l'instant"}
              </span>
            </div>

            <h4 className="text-xs font-bold text-white leading-snug mt-0.5 truncate">
              {toast.title}
            </h4>
            <p className="text-[11px] text-neutral-300 leading-snug mt-0.5 line-clamp-2">
              {toast.message}
            </p>

            {toast.targetTab && onNavigateTab && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#facc15]">
                <span>Toucher pour ouvrir</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerDismiss(0);
            }}
            aria-label="Fermer la notification"
            className="h-8 w-8 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Subtle Bottom Progress Accent */}
        {toast.durationMs !== 0 && (
          <div className="h-[2px] w-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full ${progressTint[type]} opacity-70`}
              style={{
                transformOrigin: 'left center',
                animation: `roadto2000NotifShrink ${toast.durationMs || 6000}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toasts,
  onDismiss,
  onOpenCenter,
  onNavigateTab,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-16 left-3 right-3 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto z-[130] flex flex-col gap-2 sm:max-w-sm sm:w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.slice(-3).map((toast) => (
        <SwipeableToastCard
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onOpenCenter={onOpenCenter}
          onNavigateTab={onNavigateTab}
        />
      ))}
    </div>
  );
};
