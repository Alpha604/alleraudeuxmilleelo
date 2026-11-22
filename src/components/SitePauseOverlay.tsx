/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Crown,
  KeyRound,
  Lock,
  Monitor,
  PowerOff,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Unlock,
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
import {
  fetchTotpConfigFromServer,
  getTotpSecret,
  isExplicitReadOnlyEmbed,
  isTotpEnrolled,
  setAdminSession,
  setTotpEnrolled,
  syncTotpSecretToServer,
  verifyTotpCode,
} from '../utils/security';

interface SitePauseOverlayProps {
  config: SiteActivityConfig;
  evaluation: SiteActivityEvaluation;
  deviceType: DeviceCategory;
  isIframe: boolean;
  clientIp: string;
  onOpenAdminUnlock: () => void;
  onAdminUnlocked?: () => void;
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
  onAdminUnlocked,
  onRefreshStatus,
}) => {
  const meta = SITE_PAUSE_MODE_META[config.mode] || SITE_PAUSE_MODE_META.maintenance;
  const readOnlyEmbed = isExplicitReadOnlyEmbed();

  const [inlineCode, setInlineCode] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [isVerifyingInline, setIsVerifyingInline] = useState(false);
  const [enrolled, setEnrolled] = useState<boolean>(() => isTotpEnrolled());

  useEffect(() => {
    fetchTotpConfigFromServer().then((cfg) => {
      if (cfg) {
        setEnrolled(cfg.enrolled);
      }
    });
  }, []);

  const deviceLabel =
    deviceType === 'mobile' ? 'Mobile' : deviceType === 'tablet' ? 'Tablette' : 'Ordinateur';

  const DeviceIcon =
    deviceType === 'mobile' ? Smartphone : deviceType === 'tablet' ? Tablet : Monitor;

  const verifyInline = async (candidate: string) => {
    const clean = candidate.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setInlineError('Entrez le code A2F à 6 chiffres.');
      return;
    }
    setIsVerifyingInline(true);
    setInlineError('');
    try {
      const secret = getTotpSecret();
      const ok = await verifyTotpCode(clean, secret);
      if (ok) {
        setTotpEnrolled(true);
        setEnrolled(true);
        syncTotpSecretToServer(secret, true).catch(() => {});
        setAdminSession();
        if (onAdminUnlocked) {
          onAdminUnlocked();
        }
      } else {
        setInlineError(
          'Code incorrect ou expiré. Cliquez sur « Configurer / Changer l’A2F » pour scanner le nouveau QR Code.'
        );
      }
    } catch {
      setInlineError('Erreur lors de la vérification A2F.');
    } finally {
      setIsVerifyingInline(false);
    }
  };

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
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-mono text-neutral-400">
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

        {/* Direct PC / Admin 2FA Unlock Box (Available unless URL explicitly enforces read-only embed) */}
        {!readOnlyEmbed && (
          <div className="rounded-2xl border border-[#facc15]/30 bg-neutral-950/90 p-4 sm:p-5 space-y-3 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#facc15]">
                <Lock className="h-3.5 w-3.5" />
                <span>Accès Administrateur (A2F)</span>
              </div>
              <button
                type="button"
                onClick={onOpenAdminUnlock}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-200 hover:text-[#facc15] underline underline-offset-2"
              >
                <QrCode className="h-3.5 w-3.5 text-[#facc15]" />
                <span>{enrolled ? 'Afficher QR / Changer l’A2F' : 'Scanner la nouvelle clé A2F (QR Code)'}</span>
              </button>
            </div>

            {!enrolled && (
              <div className="p-2.5 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 text-[11px] text-amber-200 flex items-center justify-between gap-2">
                <span>Une nouvelle clé A2F est prête. Scannez d'abord son QR code pour l'activer.</span>
                <button
                  type="button"
                  onClick={onOpenAdminUnlock}
                  className="px-2.5 py-1 rounded-lg bg-[#facc15] text-black font-bold shrink-0"
                >
                  Ouvrir QR
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyInline(inlineCode);
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={inlineCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setInlineCode(cleaned);
                    setInlineError('');
                    if (cleaned.length === 6) {
                      verifyInline(cleaned);
                    }
                  }}
                  placeholder="Code à 6 chiffres..."
                  className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] pl-9 pr-3 py-2.5 text-sm font-mono font-bold tracking-[0.35em] text-[#facc15] placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-neutral-500 focus:border-[#facc15] focus:outline-none"
                />
                <KeyRound className="h-4 w-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <button
                type="submit"
                disabled={isVerifyingInline || inlineCode.length !== 6}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold transition-colors disabled:opacity-40 shrink-0"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>{isVerifyingInline ? 'Vérification...' : 'Débloquer'}</span>
              </button>
            </form>

            {inlineError && (
              <div className="flex items-start gap-1.5 text-[11px] text-[#ef4444] font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{inlineError}</span>
              </div>
            )}
          </div>
        )}

        {/* Refresh Action */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={onRefreshStatus}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-bold text-neutral-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#facc15]" />
            <span>Vérifier l'état</span>
          </button>
        </div>
      </div>
    </div>
  );
};
