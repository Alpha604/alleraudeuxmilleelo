/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { triggerNotificationHaptic } from '../utils/notifications';

export interface DurationStop {
  value: 4 | 6 | 8 | 0;
  label: string;
  description: string;
}

export const DURATION_STOPS: DurationStop[] = [
  { value: 4, label: '4s', description: 'Rapide (4 secondes)' },
  { value: 6, label: '6s', description: 'Standard (6 secondes)' },
  { value: 8, label: '8s', description: 'Confort (8 secondes)' },
  { value: 0, label: 'Fixe', description: 'Reste affiché jusqu’à fermeture manuelle' },
];

interface LiquidGlassDurationSliderProps {
  value: 4 | 6 | 8 | 0;
  onChange: (durationSec: 4 | 6 | 8 | 0) => void;
  compact?: boolean;
  label?: string;
}

export const LiquidGlassDurationSlider: React.FC<LiquidGlassDurationSliderProps> = ({
  value,
  onChange,
  compact = false,
  label = 'Durée d’affichage des notifications',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectedIndex = Math.max(
    0,
    DURATION_STOPS.findIndex((stop) => stop.value === value)
  );
  const currentStop = DURATION_STOPS[selectedIndex] || DURATION_STOPS[1];
  const progressPercent = (selectedIndex / (DURATION_STOPS.length - 1)) * 100;

  const pickIndexFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (DURATION_STOPS.length - 1));
    const stop = DURATION_STOPS[idx];
    if (stop && stop.value !== value) {
      triggerNotificationHaptic('tap');
      onChange(stop.value);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    pickIndexFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    pickIndexFromClientX(e.clientX);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(DURATION_STOPS.length - 1, selectedIndex + 1);
      triggerNotificationHaptic('tap');
      onChange(DURATION_STOPS[next].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const prev = Math.max(0, selectedIndex - 1);
      triggerNotificationHaptic('tap');
      onChange(DURATION_STOPS[prev].value);
    }
  };

  return (
    <div
      className={`liquid-glass-card rounded-2xl border border-white/[0.14] bg-white/[0.05] backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.2)] ${
        compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold text-white">
          <Clock className="h-3.5 w-3.5 text-[#facc15] shrink-0" />
          <span>{label}</span>
        </span>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#facc15]/20 border border-[#facc15]/45 text-[11px] font-mono font-black text-[#facc15] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
          {currentStop.label}
        </span>
      </div>

      {/* Tactile Liquid Glass Slider Track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={DURATION_STOPS.length - 1}
        aria-valuenow={selectedIndex}
        aria-valuetext={currentStop.description}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        className="liquid-glass-track relative h-12 rounded-2xl border border-white/[0.16] bg-white/[0.04] backdrop-blur-2xl shadow-[inset_0_2px_6px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.16)] p-1.5 cursor-pointer select-none touch-none focus:outline-none focus:ring-2 focus:ring-[#facc15]/50"
      >
        {/* Specular Liquid Fill Bar */}
        <div
          aria-hidden="true"
          style={{
            width: `calc((100% - 12px) * ${selectedIndex / (DURATION_STOPS.length - 1)} + 24%)`,
            transition: isDragging ? 'none' : 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className="absolute inset-y-1.5 left-1.5 rounded-xl bg-gradient-to-r from-[#facc15]/15 via-[#facc15]/25 to-[#facc15]/35 pointer-events-none"
        />

        {/* Sliding Frosted Glass Droplet Indicator */}
        <div
          aria-hidden="true"
          style={{
            width: 'calc((100% - 12px) / 4)',
            transform: `translate3d(${selectedIndex * 100}%, 0, 0)`,
            transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className="liquid-glass-thumb absolute inset-y-1.5 left-1.5 rounded-xl bg-gradient-to-b from-[#fde047] via-[#facc15] to-[#eab308] border border-white/50 shadow-[0_6px_18px_rgba(250,204,21,0.4),inset_0_1px_1px_rgba(255,255,255,0.75)] pointer-events-none"
        />

        {/* 4 Magnetic Segment Labels */}
        <div className="relative z-10 grid grid-cols-4 h-full">
          {DURATION_STOPS.map((stop, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={stop.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerNotificationHaptic('tap');
                  onChange(stop.value);
                }}
                className={`flex items-center justify-center text-xs font-mono font-extrabold rounded-xl transition-colors cursor-pointer ${
                  isSelected
                    ? 'liquid-glass-thumb-label text-black'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                {stop.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Caption */}
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>{currentStop.description}</span>
        <span className="font-mono text-[10px] opacity-80">{Math.round(progressPercent)}%</span>
      </div>
    </div>
  );
};
