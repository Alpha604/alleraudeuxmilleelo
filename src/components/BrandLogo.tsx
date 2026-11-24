/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'lockup' | 'icon';
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: {
    box: 'h-9 w-9 rounded-xl',
    svg: 'h-5 w-5',
    title: 'text-sm sm:text-base',
    subtitle: 'text-[10px]',
    gap: 'gap-2.5',
  },
  md: {
    box: 'h-10 w-10 sm:h-11 sm:w-11 rounded-2xl',
    svg: 'h-6 w-6',
    title: 'text-base sm:text-lg',
    subtitle: 'text-[10px] sm:text-[11px]',
    gap: 'gap-3',
  },
  lg: {
    box: 'h-14 w-14 rounded-2xl',
    svg: 'h-8 w-8',
    title: 'text-xl sm:text-2xl',
    subtitle: 'text-xs',
    gap: 'gap-3.5',
  },
};

/**
 * Minimalist Chess King Crown + Rising Elo Arrow geometric vector emblem.
 * High-precision SVG craft suitable for both Obsidian Dark and Frosted White Light themes.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  variant = 'lockup',
  showSubtitle = false,
  subtitle = 'Suivi Performance',
  className = '',
}) => {
  const cfg = SIZE_MAP[size];

  const Emblem = (
    <div
      className={`brand-emblem-box relative flex items-center justify-center shrink-0 border border-[#facc15]/40 bg-gradient-to-br from-[#141925] via-[#0c1018] to-[#080a10] shadow-[0_6px_20px_-4px_rgba(250,204,21,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] overflow-hidden ${cfg.box}`}
    >
      {/* Subtle specular sheen */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${cfg.svg} drop-shadow-[0_1px_4px_rgba(250,204,21,0.35)]`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="brandGoldGrad" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="brandArrowGrad" x1="8" y1="26" x2="30" y2="7" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>
        </defs>

        {/* King Cross Finial */}
        <path
          d="M15.5 4.2V7.8M13.7 6H17.3"
          stroke="url(#brandGoldGrad)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Minimalist King Crown Silhouette (left/center-balanced to harmonize with Elo arrow) */}
        <path
          d="M7.2 21.5L5.5 11.8L11.2 14.5L15.5 9.2L19.8 14.5L23.5 12.8"
          stroke="url(#brandGoldGrad)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Crown Base Pedestal */}
        <path
          d="M7.5 24.5H23.5M8.5 27.6H22.5"
          stroke="url(#brandGoldGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.92"
        />

        {/* Rising Elo Trajectory Arrow piercing upward-right */}
        <path
          d="M10.5 21.8L17.2 17.6L21.5 18.8L29.5 9.8"
          stroke="url(#brandArrowGrad)"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24.6 9.5H29.8V14.7"
          stroke="url(#brandArrowGrad)"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center ${className}`}>{Emblem}</div>;
  }

  return (
    <div className={`inline-flex items-center ${cfg.gap} min-w-0 ${className}`}>
      {Emblem}
      <div className="flex flex-col leading-none min-w-0 text-left">
        <span
          className={`brand-wordmark font-display font-black tracking-tight text-white truncate ${cfg.title}`}
        >
          Road to <span className="brand-wordmark-accent text-[#facc15]">2000</span>
        </span>
        {showSubtitle && (
          <span
            className={`brand-subtitle mt-0.5 font-mono uppercase tracking-[0.14em] text-neutral-400 truncate ${cfg.subtitle}`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
