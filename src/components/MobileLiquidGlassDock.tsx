/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  History,
  LayoutDashboard,
  LineChart,
  Lock,
  Settings as SettingsIcon,
  ShieldAlert,
} from 'lucide-react';
import { NavTab } from './Navbar';
import { triggerNotificationHaptic } from '../utils/notifications';

interface DockItem {
  key: NavTab;
  label: string;
  icon: React.ReactNode;
  protected?: boolean;
}

interface MobileLiquidGlassDockProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isAdmin: boolean;
  isIframe: boolean;
  isSpectator: boolean;
  hasAdminAccess: boolean;
  onOpenSecurityModal: (title?: string, onGranted?: () => void) => void;
}

export const MobileLiquidGlassDock: React.FC<MobileLiquidGlassDockProps> = ({
  currentTab,
  onSelectTab,
  isAdmin,
  isIframe,
  isSpectator,
  hasAdminAccess,
  onOpenSecurityModal,
}) => {
  const items: DockItem[] = useMemo(() => {
    const list: DockItem[] = [
      { key: 'dashboard', label: 'Bilan', icon: <LayoutDashboard className="h-[19px] w-[19px]" /> },
      { key: 'charts', label: 'Courbe', icon: <LineChart className="h-[19px] w-[19px]" /> },
      { key: 'calendar', label: 'Calendrier', icon: <Calendar className="h-[19px] w-[19px]" /> },
    ];
    if (!isSpectator) {
      list.push({ key: 'history', label: 'Journal', icon: <History className="h-[19px] w-[19px]" /> });
    }
    if (!isIframe && !isSpectator && hasAdminAccess) {
      list.push({
        key: 'admin',
        label: 'Admin',
        icon: <ShieldAlert className="h-[19px] w-[19px]" />,
        protected: true,
      });
    }
    if (!isIframe && !isSpectator) {
      list.push({
        key: 'settings',
        label: 'Réglages',
        icon: <SettingsIcon className="h-[19px] w-[19px]" />,
        protected: true,
      });
    }
    return list;
  }, [isSpectator, isIframe, hasAdminAccess]);

  const activeIndex = useMemo(() => {
    const idx = items.findIndex((it) => it.key === currentTab);
    return idx >= 0 ? idx : 0;
  }, [items, currentTab]);

  const trackRef = useRef<HTMLDivElement>(null);
  const pointerStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    moved: boolean;
    lastSlot: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    moved: false,
    lastSlot: activeIndex,
  });

  // Continuous glass droplet position (float from 0 to items.length - 1)
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const commitItem = useCallback(
    (item: DockItem) => {
      if (!isAdmin && item.protected) {
        onOpenSecurityModal(
          item.key === 'admin' ? 'Panel Administrateur' : 'Accès aux Réglages',
          () => onSelectTab(item.key)
        );
        return;
      }
      onSelectTab(item.key);
    },
    [isAdmin, onOpenSecurityModal, onSelectTab]
  );

  // Compute fractional position & nearest slot from pointer X
  const computePositionFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || items.length === 0) return { frac: 0, slot: 0 };
      const rect = el.getBoundingClientRect();
      const slotWidth = rect.width / items.length;
      if (slotWidth <= 0) return { frac: 0, slot: 0 };

      // Center pointer directly inside slot coordinate [0 .. items.length - 1]
      const relX = clientX - rect.left;
      const rawFrac = relX / slotWidth - 0.5;
      const clampedFrac = Math.max(0, Math.min(items.length - 1, rawFrac));
      const slot = Math.max(0, Math.min(items.length - 1, Math.round(clampedFrac)));
      return { frac: clampedFrac, slot };
    },
    [items.length]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const { frac, slot } = computePositionFromClientX(e.clientX);
    pointerStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      moved: false,
      lastSlot: slot,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setDragPosition(frac);
    setIsDragging(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = pointerStateRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    const deltaX = Math.abs(e.clientX - st.startX);
    if (deltaX > 5 && !st.moved) {
      st.moved = true;
      setIsDragging(true);
    }

    const { frac, slot } = computePositionFromClientX(e.clientX);
    setDragPosition(frac);

    if (slot !== st.lastSlot) {
      st.lastSlot = slot;
      triggerNotificationHaptic('tap');
    }
  };

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const st = pointerStateRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    const { slot } = computePositionFromClientX(e.clientX);
    const chosenItem = items[slot];

    pointerStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      moved: false,
      lastSlot: slot,
    };
    setIsDragging(false);
    setDragPosition(null);

    if (!cancelled && chosenItem) {
      triggerNotificationHaptic('tap');
      commitItem(chosenItem);
    }
  };

  // Sync drag fallback cleanly if tab changes externally
  useEffect(() => {
    if (!pointerStateRef.current.active) {
      setDragPosition(null);
      setIsDragging(false);
    }
  }, [activeIndex]);

  const effectiveIndex = dragPosition !== null ? dragPosition : activeIndex;
  const hoveredSlot = Math.max(0, Math.min(items.length - 1, Math.round(effectiveIndex)));
  const slotPercentWidth = 100 / Math.max(1, items.length);

  return (
    <nav
      aria-label="Navigation mobile"
      className="sm:hidden fixed bottom-2.5 left-2.5 right-2.5 z-40 select-none pb-[env(safe-area-inset-bottom)]"
    >
      {/* Floating Magnified Liquid Preview Bubble shown above the droplet while sliding */}
      {isDragging && items[hoveredSlot] && (
        <div
          className="pointer-events-none absolute -top-11 left-0 right-0 flex justify-center transition-opacity duration-150"
          aria-hidden="true"
        >
          <div
            className="px-3.5 py-1.5 rounded-full border border-white/25 bg-[#0c111a]/75 backdrop-blur-2xl backdrop-saturate-150 text-xs font-bold text-[#facc15] shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.28)]"
            style={{
              transform: `translateX(${((hoveredSlot - (items.length - 1) / 2) / items.length) * 210}px)`,
              transition: 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {items[hoveredSlot].label}
          </div>
        </div>
      )}

      {/* Outer Liquid Glass Dock Container */}
      <div className="relative rounded-[28px] p-1 border border-white/[0.16] bg-[#0a0e16]/65 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_14px_40px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-1px_0_rgba(255,255,255,0.06)] overflow-hidden">
        {/* Top Specular Glass Rim Sheen */}
        <div
          className="pointer-events-none absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/45 to-transparent"
          aria-hidden="true"
        />

        {/* Interactive Sliding Track */}
        <div
          ref={trackRef}
          role="tablist"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => finishPointer(e, false)}
          onPointerCancel={(e) => finishPointer(e, true)}
          className="relative grid items-center touch-none cursor-grab active:cursor-grabbing"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {/* Liquid Glass Refractive Sliding Droplet */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 left-0 p-0.5"
            style={{
              width: `${slotPercentWidth}%`,
              transform: `translate3d(${effectiveIndex * 100}%, 0, 0) scale(${isDragging ? '1.07, 0.94' : '1, 1'})`,
              transition: isDragging
                ? 'transform 45ms linear'
                : 'transform 340ms cubic-bezier(0.22, 1.28, 0.36, 1)',
            }}
          >
            <div className="h-full w-full rounded-[22px] border border-white/25 bg-gradient-to-b from-white/[0.22] via-[#facc15]/[0.16] to-white/[0.05] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),inset_0_-2px_6px_rgba(250,204,21,0.16),0_4px_16px_rgba(250,204,21,0.18)] relative overflow-hidden">
              <div className="absolute inset-x-2 top-0.5 h-2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
            </div>
          </div>

          {/* Navigation Destinations */}
          {items.map((item, idx) => {
            const isHighlighted = idx === hoveredSlot;
            const distance = Math.abs(effectiveIndex - idx);
            const scale = isDragging ? Math.max(0.92, 1.12 - distance * 0.14) : isHighlighted ? 1.05 : 1;

            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={currentTab === item.key}
                onClick={(e) => {
                  // Keyboard / synthetic accessibility clicks still work cleanly; pointer taps are handled in finishPointer
                  if (e.detail === 0) {
                    commitItem(item);
                  }
                }}
                className={`relative z-10 flex flex-col items-center justify-center min-h-[52px] py-1.5 px-1 rounded-[22px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#facc15] ${
                  isHighlighted ? 'text-[#facc15]' : 'text-neutral-300/80'
                }`}
                style={{
                  transform: `scale(${scale})`,
                  transition: isDragging
                    ? 'transform 70ms linear, color 120ms ease'
                    : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), color 150ms ease',
                }}
              >
                <div className="relative flex items-center justify-center">
                  {item.icon}
                  {item.protected && !isAdmin && (
                    <Lock className="h-2.5 w-2.5 absolute -top-1 -right-1.5 text-[#facc15] drop-shadow" />
                  )}
                </div>
                <span
                  className={`mt-0.5 text-[10px] leading-none tracking-tight whitespace-nowrap truncate max-w-full ${
                    isHighlighted ? 'font-bold text-white' : 'font-medium text-neutral-400'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
