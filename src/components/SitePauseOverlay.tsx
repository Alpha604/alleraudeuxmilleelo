/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Clock,
  Crown,
  Lock,
  Monitor,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Wrench,
} from 'lucide-react';
import {
  DeviceCategory,
  formatRemainingDuration,
  SITE_PAUSE_MODE_META,
  SiteActivityConfig,
  SiteActivityEvaluation,
  SitePauseMode,
} from '../utils/siteActivity';
import { formatJsonBinTimestamp } from '../utils/cloudSync';

interface SitePauseOverlayProps {
  config: SiteActivityConfig;
  evaluation: SiteActivityEvaluation;
  deviceType: DeviceCategory;
  isIframe: boolean;
  clientIp: string;
  onOpenAdminUnlock: () => void;
  onRefreshStatus: () => void;
}

const MODE_ICONS: Record<SitePauseMode, React.ReactNode> = {
  arret: <PowerOff className="h-8 w-8 text-[#ef4444]" />,
  maintenance: <Wrench className="h-8 w-8 text-amber-400" />,
  administration: <ShieldCheck className="h-8 w-8 text-[#facc15]" />,
  moderation: <ShieldAlert className="h-8 w-8 text-purple-400" />,
  mise_a_jour: <RefreshCw className="h-8 w-8 text-sky-400 animate-spin" />,
};

export const SitePauseOverlay: React.FC<SitePauseOverlayProps> = ({
  config,
  evaluation,
  deviceType,
  isIframe,
  clientIp,
  onOpenAdminUnlock,
  onRefreshStatus,
}) => {
  const meta = SITE_PAUSE_MODE_META[config.mode] || SITE_PAUSE_MODE_META.maintenance;

  const deviceLabel =
    deviceType === 'mobile' ? 'Mobile' : deviceType === 'tablet' ? 'Tablette' : 'Ordinateur';

  const DeviceIcon =
    deviceType === 'mobile' ? Smartphone : deviceType === 'tablet' ? Tablet : Monitor;

  return (
    <div className="fixed inset-0 z-[100] bg-[#07090e] text-neutral-100 flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
      {/* Subtle Ambient Accent Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[380px] blur-3xl opacity-15 rounded-full"
          style={{ backgroundColor: meta.accentHex }}
        />
      </div>

      <div className="relative z-10 w-full max-w-xl rounded-3xl border border-neutral-800 bg-[#0b0e14]/95 backdrop-blur-2xl p-6 sm:p-10 shadow-2xl space-y-6 text-center">
        {/* Brand Top Pill */}
        <div className="flex items-center justify-center gap-2 text-xs font-display font-bold tracking-wider text-neutral-400">
          <Crown className="h-4 w-4 text-[#facc15]" />
          <span>ROAD TO 2000 ELO</span>
        </div>

        {/* Mode Icon Container */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-3xl border border-neutral-800 bg-neutral-950 flex items-center justify-center shadow-inner">
            {MODE_ICONS[config.mode]}
          </div>
        </div>

        {/* Mode Badge */}
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${meta.badgeClasses}`}
          >
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ backgroundColor: meta.accentHex }}
            />
            <span>{meta.label}</span>
          </span>
        </div>

        {/* Title & Custom Message */}
        <div className="space-y-2.5">
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">
            {config.customTitle || meta.defaultTitle}
          </h1>
          <p className="text-sm text-neutral-300 leading-relaxed max-w-md mx-auto">
            {config.customMessage || meta.defaultMessage}
          </p>
        </div>

        {/* Estimated Resume Countdown / Time Box */}
        {config.resumeAtTimestamp && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4 space-y-1.5">
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
              <Clock className="h-3.5 w-3.5 text-[#facc15]" />
              <span>Reprise estimée</span>
            </div>
            {evaluation.secondsUntilResume !== null && evaluation.secondsUntilResume > 0 ? (
              <>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-[#facc15]">
                  {formatRemainingDuration(evaluation.secondsUntilResume)}
                </div>
                <div className="text-[11px] font-mono text-neutral-400">
                  Prévu le {formatJsonBinTimestamp(config.resumeAtTimestamp)} (Paris)
                </div>
              </>
            ) : (
              <div className="text-xs font-mono text-neutral-300">
                Prévu le {formatJsonBinTimestamp(config.resumeAtTimestamp)} (Paris)
              </div>
            )}
          </div>
        )}

        {/* Context Metadata (Device / Iframe / IP) */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] font-mono text-neutral-400">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-neutral-800 bg-neutral-950">
            <DeviceIcon className="h-3.5 w-3.5 text-neutral-400" />
            <span>{deviceLabel}</span>
          </span>
          {isIframe && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-neutral-800 bg-neutral-950 text-amber-400">
              Iframe intégré
            </span>
          )}
          {clientIp && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-neutral-800 bg-neutral-950">
              IP : {clientIp}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={onRefreshStatus}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-bold text-neutral-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Vérifier l'état</span>
          </button>

          {!isIframe && (
            <button
              type="button"
              onClick={onOpenAdminUnlock}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#facc15]/15 hover:bg-[#facc15]/25 border border-[#facc15]/40 text-xs font-bold text-[#facc15] transition-colors"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Accès Administrateur (2FA)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
