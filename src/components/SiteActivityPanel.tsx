/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Eye,
  FileText,
  Globe,
  Laptop,
  Monitor,
  PauseCircle,
  PlayCircle,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Tag,
  Timer,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { getClientIp, getTrustedIps } from '../utils/security';
import { formatJsonBinTimestamp, JSONBIN_TEMPORARILY_DISABLED } from '../utils/cloudSync';
import {
  detectDeviceCategory,
  formatRemainingDuration,
  getLocalSiteActivityConfig,
  IframePolicy,
  IpPolicyMode,
  ResumeType,
  saveSiteActivity,
  ScheduleType,
  SITE_PAUSE_MODE_META,
  SiteActivityConfig,
  SitePauseMode,
} from '../utils/siteActivity';

interface SiteActivityPanelProps {
  currentConfig: SiteActivityConfig;
  currentClientIp: string;
  onConfigUpdated: (updated: SiteActivityConfig) => void;
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning', title?: string) => void;
}

function toLocalDatetimeInputValue(ts: number | null | undefined): string {
  const d = ts ? new Date(ts) : new Date(Date.now() + 15 * 60 * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SiteActivityPanel: React.FC<SiteActivityPanelProps> = ({
  currentConfig,
  currentClientIp,
  onConfigUpdated,
  onShowMessage,
}) => {
  const [draft, setDraft] = useState<SiteActivityConfig>(() => currentConfig || getLocalSiteActivityConfig());
  const [exactPauseInput, setExactPauseInput] = useState<string>(() =>
    toLocalDatetimeInputValue(currentConfig?.pauseAtTimestamp)
  );
  const [exactResumeInput, setExactResumeInput] = useState<string>(() =>
    toLocalDatetimeInputValue(currentConfig?.resumeAtTimestamp)
  );
  const [newIpInput, setNewIpInput] = useState('');
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastCloudSyncOk, setLastCloudSyncOk] = useState<boolean | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const trustedIps = getTrustedIps();
  const detectedDevice = detectDeviceCategory();
  const isCurrentIpTrusted = Boolean(
    currentClientIp && trustedIps.some((t) => t.trim() === currentClientIp.trim())
  );

  useEffect(() => {
    setDraft(currentConfig);
    if (currentConfig.pauseAtTimestamp) {
      setExactPauseInput(toLocalDatetimeInputValue(currentConfig.pauseAtTimestamp));
    }
    if (currentConfig.resumeAtTimestamp) {
      setExactResumeInput(toLocalDatetimeInputValue(currentConfig.resumeAtTimestamp));
    }
  }, [currentConfig.revision, currentConfig.updatedAt, currentConfig.enabled]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewOpen]);

  const handleSelectMode = (mode: SitePauseMode) => {
    const prevMeta = SITE_PAUSE_MODE_META[draft.mode];
    const nextMeta = SITE_PAUSE_MODE_META[mode];
    const usesDefaultTitle = !draft.customTitle || draft.customTitle === prevMeta.defaultTitle;
    const usesDefaultMsg = !draft.customMessage || draft.customMessage === prevMeta.defaultMessage;

    setDraft((prev) => ({
      ...prev,
      mode,
      customTitle: usesDefaultTitle ? nextMeta.defaultTitle : prev.customTitle,
      customMessage: usesDefaultMsg ? nextMeta.defaultMessage : prev.customMessage,
    }));
  };

  const applyQuickPreset = (preset: 'update' | 'maintenance15' | 'stop') => {
    if (preset === 'update') {
      const meta = SITE_PAUSE_MODE_META.mise_a_jour;
      setDraft((prev) => ({
        ...prev,
        mode: 'mise_a_jour',
        customTitle: meta.defaultTitle,
        customMessage: meta.defaultMessage,
        upcomingVersion: prev.upcomingVersion || '1.1.0',
        scheduleType: 'immediate',
        resumeType: 'duration',
        resumeDurationMinutes: 10,
        autoResume: true,
      }));
    } else if (preset === 'maintenance15') {
      const meta = SITE_PAUSE_MODE_META.maintenance;
      setDraft((prev) => ({
        ...prev,
        mode: 'maintenance',
        customTitle: meta.defaultTitle,
        customMessage: meta.defaultMessage,
        scheduleType: 'immediate',
        resumeType: 'duration',
        resumeDurationMinutes: 15,
        autoResume: true,
      }));
    } else {
      const meta = SITE_PAUSE_MODE_META.arret;
      setDraft((prev) => ({
        ...prev,
        mode: 'arret',
        customTitle: meta.defaultTitle,
        customMessage: meta.defaultMessage,
        scheduleType: 'immediate',
        resumeType: 'manual',
        autoResume: false,
      }));
    }
  };

  const buildNormalizedTimestamps = (source: SiteActivityConfig): SiteActivityConfig => {
    const now = Date.now();
    let pauseAtTimestamp: number | null = source.pauseAtTimestamp;

    if (source.scheduleType === 'immediate') {
      pauseAtTimestamp = now;
    } else if (source.scheduleType === 'countdown') {
      const mins = Math.max(1, source.countdownMinutes || 5);
      pauseAtTimestamp = now + mins * 60 * 1000;
    } else if (source.scheduleType === 'exact_date') {
      const parsed = exactPauseInput ? new Date(exactPauseInput).getTime() : NaN;
      pauseAtTimestamp = !isNaN(parsed) ? parsed : now;
    }

    let resumeAtTimestamp: number | null = null;
    const effectiveStart = pauseAtTimestamp ?? now;

    if (source.resumeType === 'duration') {
      const rMins = Math.max(1, source.resumeDurationMinutes || 30);
      resumeAtTimestamp = effectiveStart + rMins * 60 * 1000;
    } else if (source.resumeType === 'exact_date') {
      const parsedR = exactResumeInput ? new Date(exactResumeInput).getTime() : NaN;
      resumeAtTimestamp = !isNaN(parsedR) ? parsedR : null;
    }

    return {
      ...source,
      pauseAtTimestamp,
      resumeAtTimestamp,
    };
  };

  const handleSaveAndApply = async (enablePause?: boolean) => {
    setIsSaving(true);
    try {
      const targetEnabled = typeof enablePause === 'boolean' ? enablePause : draft.enabled;
      const prepared = buildNormalizedTimestamps({
        ...draft,
        enabled: targetEnabled,
      });

      const res = await saveSiteActivity(prepared);
      setDraft(res.config);
      onConfigUpdated(res.config);
      setLastCloudSyncOk(res.cloudSynced);
      setCloudSyncError(res.cloudSynced ? null : res.error || 'Synchronisation Cloud non confirmée.');

      if (!res.cloudSynced) {
        onShowMessage(
          `Enregistré localement, mais la propagation Cloud a échoué (${res.error || 'Cloud inaccessible'}).`,
          'warning',
          'Propagation Cloud Partielle'
        );
      } else if (!res.config.enabled) {
        onShowMessage(
          'Le site est maintenant EN LIGNE pour tous les appareils.',
          'success',
          'Site en ligne'
        );
      } else if (
        res.config.scheduleType !== 'immediate' &&
        res.config.pauseAtTimestamp &&
        res.config.pauseAtTimestamp > Date.now()
      ) {
        onShowMessage(
          `Blocage (${SITE_PAUSE_MODE_META[res.config.mode].label}) programmé pour le ${formatJsonBinTimestamp(res.config.pauseAtTimestamp)}.`,
          'warning',
          'Blocage Programmé'
        );
      } else {
        onShowMessage(
          `Le site est maintenant bloqué (${SITE_PAUSE_MODE_META[res.config.mode].label}) sur tous les appareils ciblés.`,
          'warning',
          'Site en Pause'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDetectIp = async () => {
    setIsDetectingIp(true);
    try {
      const ip = currentClientIp || (await getClientIp());
      if (ip) {
        setNewIpInput(ip);
        onShowMessage(`IP détectée : ${ip}`, 'info');
      } else {
        onShowMessage('Impossible de détecter votre IP publique.', 'warning');
      }
    } finally {
      setIsDetectingIp(false);
    }
  };

  const handleAddTargetIp = () => {
    const clean = newIpInput.trim();
    if (clean.length < 3) return;
    if (draft.ipPolicy.ips.includes(clean)) {
      setNewIpInput('');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      ipPolicy: {
        ...prev.ipPolicy,
        ips: [...prev.ipPolicy.ips, clean],
      },
    }));
    setNewIpInput('');
  };

  const handleRemoveTargetIp = (ip: string) => {
    setDraft((prev) => ({
      ...prev,
      ipPolicy: {
        ...prev.ipPolicy,
        ips: prev.ipPolicy.ips.filter((item) => item !== ip),
      },
    }));
  };

  const modeIcons: Record<SitePauseMode, React.ReactNode> = {
    arret: <PowerOff className="h-4 w-4 text-[#ef4444]" />,
    maintenance: <Wrench className="h-4 w-4 text-amber-400" />,
    administration: <ShieldCheck className="h-4 w-4 text-[#facc15]" />,
    moderation: <ShieldAlert className="h-4 w-4 text-purple-400" />,
    mise_a_jour: <RefreshCw className="h-4 w-4 text-sky-400" />,
  };

  const isAutoResumeExpired = Boolean(
    currentConfig.enabled &&
      currentConfig.autoResume &&
      currentConfig.resumeAtTimestamp &&
      nowTick >= currentConfig.resumeAtTimestamp
  );

  const isCurrentlyPaused =
    currentConfig.enabled &&
    !isAutoResumeExpired &&
    (currentConfig.scheduleType === 'immediate' ||
      !currentConfig.pauseAtTimestamp ||
      nowTick >= currentConfig.pauseAtTimestamp);

  const isCountdownRunning =
    currentConfig.enabled &&
    !isAutoResumeExpired &&
    currentConfig.scheduleType !== 'immediate' &&
    Boolean(currentConfig.pauseAtTimestamp && currentConfig.pauseAtTimestamp > nowTick);

  const secondsLeft =
    isCountdownRunning && currentConfig.pauseAtTimestamp
      ? Math.max(0, Math.ceil((currentConfig.pauseAtTimestamp - nowTick) / 1000))
      : null;

  const scheduleSummaryText = (() => {
    const startPart =
      draft.scheduleType === 'immediate'
        ? 'le blocage démarre immédiatement'
        : draft.scheduleType === 'countdown'
        ? `le blocage démarre dans ${draft.countdownMinutes} minute(s)`
        : `le blocage démarre le ${exactPauseInput ? exactPauseInput.replace('T', ' à ') : '(date à définir)'}`;

    const endPart =
      draft.resumeType === 'manual'
        ? 'et restera actif jusqu’à réactivation manuelle.'
        : draft.resumeType === 'duration'
        ? `pendant environ ${draft.resumeDurationMinutes} minute(s) (${draft.autoResume ? 'reprise automatique' : 'affichage estimatif'}).`
        : `jusqu’au ${exactResumeInput ? exactResumeInput.replace('T', ' à ') : '(fin à définir)'} (${draft.autoResume ? 'reprise automatique' : 'affichage estimatif'}).`;

    return `Résumé : ${startPart} ${endPart}`;
  })();

  const targetingSummaryText = (() => {
    const devLabel = draft.devices.all
      ? 'Tous les appareils'
      : [
          draft.devices.desktop && 'PC',
          draft.devices.mobile && 'Mobile',
          draft.devices.tablet && 'Tablette',
        ]
          .filter(Boolean)
          .join(' + ') || 'Aucun appareil';

    const iframeLabel =
      draft.iframePolicy === 'block_all'
        ? 'Iframes bloqués'
        : draft.iframePolicy === 'block_only_iframes'
        ? 'Uniquement Iframes'
        : 'Iframes autorisés';

    const ipLabel =
      draft.ipPolicy.mode === 'all'
        ? 'Toutes IP'
        : draft.ipPolicy.mode === 'except_list'
        ? `Liste blanche (${draft.ipPolicy.ips.length} IP)`
        : `Uniquement (${draft.ipPolicy.ips.length} IP)`;

    const adminLabel = draft.allowAdminBypass
      ? 'Votre accès A2F reste autorisé'
      : 'Bypass Admin désactivé';

    return `${devLabel} · ${iframeLabel} · ${ipLabel} · ${adminLabel}`;
  })();

  const draftMeta = SITE_PAUSE_MODE_META[draft.mode] || SITE_PAUSE_MODE_META.maintenance;
  const cleanUpcomingVersion = (draft.upcomingVersion || '').trim().replace(/^v+/i, '');

  return (
    <div className="space-y-5">
      {/* Live Status & Quick Presets Banner */}
      <section
        className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${
          isCurrentlyPaused
            ? 'border-[#ef4444]/40 bg-[#ef4444]/10'
            : isCountdownRunning
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-[#10b981]/30 bg-[#10b981]/[0.06]'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              {isCurrentlyPaused ? (
                <span className="text-[#ef4444] uppercase tracking-wider">
                  Site actuellement bloqué · {SITE_PAUSE_MODE_META[currentConfig.mode].label}
                </span>
              ) : isCountdownRunning ? (
                <span className="text-amber-400 uppercase tracking-wider tabular-nums">
                  Blocage programmé dans {formatRemainingDuration(secondsLeft)}
                </span>
              ) : (
                <span className="text-[#10b981] uppercase tracking-wider">
                  Site en ligne · Accessible aux visiteurs
                </span>
              )}

              {currentClientIp && (
                <>
                  <span aria-hidden="true" className="text-neutral-600">·</span>
                  <span className="text-[11px] font-mono font-normal text-neutral-400">
                    IP : {currentClientIp}
                  </span>
                </>
              )}
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              {isCurrentlyPaused
                ? `Les visiteurs voient votre écran de pause.${
                    currentConfig.allowAdminBypass
                      ? ' Vous pouvez toujours naviguer librement avec votre session A2F.'
                      : ' Attention : le bypass Admin est désactivé.'
                  }`
                : isCountdownRunning && currentConfig.pauseAtTimestamp
                ? `Le site basculera en mode « ${SITE_PAUSE_MODE_META[currentConfig.mode].label} » le ${formatJsonBinTimestamp(
                    currentConfig.pauseAtTimestamp
                  )}.`
                : 'Utilisez un raccourci ci-dessous ou personnalisez le message et les détails avant de bloquer.'}
            </p>

            {lastCloudSyncOk !== null && (
              <p
                className={`text-[11px] font-semibold ${
                  lastCloudSyncOk ? 'text-[#10b981]' : 'text-[#ef4444]'
                }`}
              >
                {lastCloudSyncOk
                  ? `Synchronisé sur tous les appareils (rév. #${currentConfig.revision || 1})`
                  : `Erreur synchronisation : ${cloudSyncError || 'non propagé'}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-bold text-neutral-200 transition-colors cursor-pointer"
            >
              <Eye className="h-4 w-4 text-[#facc15]" />
              <span>Aperçu visiteur</span>
            </button>

            {currentConfig.enabled && !isAutoResumeExpired && (
              <button
                type="button"
                onClick={() => handleSaveAndApply(false)}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10b981] hover:bg-emerald-400 text-black text-xs font-extrabold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <PlayCircle className="h-4 w-4" />
                <span>Remettre le site en ligne</span>
              </button>
            )}
          </div>
        </div>

        {/* Complete Admin Pause & Schedule Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-white/[0.08] text-xs">
          {/* 1. État & Révision */}
          <div className="rounded-xl border border-neutral-800/80 bg-[#07090e]/80 p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              État &amp; Mode
            </span>
            <div className="font-bold text-white flex items-center justify-between gap-2">
              <span
                className={
                  isCurrentlyPaused
                    ? 'text-[#ef4444]'
                    : isCountdownRunning
                    ? 'text-amber-300'
                    : 'text-[#10b981]'
                }
              >
                {isCurrentlyPaused
                  ? 'Bloqué maintenant'
                  : isCountdownRunning
                  ? 'Programmé'
                  : isAutoResumeExpired
                  ? 'Reprise auto expirée'
                  : 'En ligne'}
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                rév. #{currentConfig.revision || 0}
              </span>
            </div>
            <div className="text-[11px] text-neutral-300 truncate">
              {SITE_PAUSE_MODE_META[currentConfig.mode]?.label || 'Maintenance'}
              {currentConfig.upcomingVersion ? ` · v${currentConfig.upcomingVersion.replace(/^v+/i, '')}` : ''}
            </div>
          </div>

          {/* 2. Début du blocage */}
          <div className="rounded-xl border border-neutral-800/80 bg-[#07090e]/80 p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              Début de la pause
            </span>
            {currentConfig.enabled && !isAutoResumeExpired ? (
              <>
                <div className="font-mono text-[11px] font-bold text-white">
                  {currentConfig.pauseAtTimestamp
                    ? formatJsonBinTimestamp(currentConfig.pauseAtTimestamp)
                    : 'Immédiat'}
                </div>
                <div className="text-[11px] font-mono text-amber-300 tabular-nums">
                  {isCountdownRunning && secondsLeft !== null
                    ? `Début dans ${formatRemainingDuration(secondsLeft)}`
                    : 'Démarrée'}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-[11px] text-neutral-400">Aucune pause active</div>
                <div className="text-[11px] text-neutral-500">
                  {currentConfig.updatedAt ? `MàJ : ${formatJsonBinTimestamp(currentConfig.updatedAt)}` : 'Prêt'}
                </div>
              </>
            )}
          </div>

          {/* 3. Fin / Réouverture */}
          <div className="rounded-xl border border-neutral-800/80 bg-[#07090e]/80 p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              Fin / Réouverture
            </span>
            {currentConfig.enabled && !isAutoResumeExpired ? (
              currentConfig.resumeType === 'manual' ? (
                <>
                  <div className="font-bold text-[11px] text-amber-300">Réouverture manuelle</div>
                  <div className="text-[11px] text-neutral-400">Reste bloqué jusqu&apos;à action A2F</div>
                </>
              ) : (
                <>
                  <div className="font-mono text-[11px] font-bold text-white">
                    {currentConfig.resumeAtTimestamp
                      ? formatJsonBinTimestamp(currentConfig.resumeAtTimestamp)
                      : 'Heure à définir'}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-[#10b981] tabular-nums">
                      {currentConfig.resumeAtTimestamp && currentConfig.resumeAtTimestamp > nowTick
                        ? `Fin dans ${formatRemainingDuration(Math.ceil((currentConfig.resumeAtTimestamp - nowTick) / 1000))}`
                        : 'Imminent'}
                    </span>
                    <span className="text-[10px] font-bold text-neutral-300">
                      {currentConfig.autoResume ? 'Automatique' : 'Estimatif'}
                    </span>
                  </div>
                </>
              )
            ) : (
              <>
                <div className="font-mono text-[11px] text-neutral-400">—</div>
                <div className="text-[11px] text-neutral-500">Accès visiteur normal</div>
              </>
            )}
          </div>

          {/* 4. Cible & Bypass */}
          <div className="rounded-xl border border-neutral-800/80 bg-[#07090e]/80 p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              Cible &amp; Accès Admin
            </span>
            <div className="text-[11px] font-bold text-white truncate">
              {currentConfig.devices?.all
                ? 'Tous les appareils'
                : [
                    currentConfig.devices?.desktop && 'PC',
                    currentConfig.devices?.mobile && 'Mobile',
                    currentConfig.devices?.tablet && 'Tablette',
                  ]
                    .filter(Boolean)
                    .join(' + ') || 'Aucun'}
              {' · '}
              {currentConfig.iframePolicy === 'block_all'
                ? 'Iframes bloqués'
                : currentConfig.iframePolicy === 'block_only_iframes'
                ? 'Iframes seuls'
                : 'Iframes OK'}
            </div>
            <div className="text-[11px] text-neutral-400 truncate">
              Bypass A2F :{' '}
              <strong className={currentConfig.allowAdminBypass ? 'text-[#10b981]' : 'text-[#ef4444]'}>
                {currentConfig.allowAdminBypass ? 'Autorisé' : 'Désactivé'}
              </strong>
              {' · '}
              {currentConfig.ipPolicy?.mode === 'all'
                ? 'Toutes IP'
                : currentConfig.ipPolicy?.mode === 'except_list'
                ? `Sauf ${currentConfig.ipPolicy.ips.length} IP`
                : `Uniq. ${currentConfig.ipPolicy.ips.length} IP`}
            </div>
          </div>
        </div>

        {/* Fast Scenario Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.08]">
          <span className="text-[11px] font-semibold text-neutral-400 mr-1">
            Modèles rapides :
          </span>
          <button
            type="button"
            onClick={() => applyQuickPreset('update')}
            className="px-3 py-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-[11px] font-bold text-sky-300 transition-colors cursor-pointer"
          >
            Préparer une Mise à jour (10 min)
          </button>
          <button
            type="button"
            onClick={() => applyQuickPreset('maintenance15')}
            className="px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] font-bold text-amber-300 transition-colors cursor-pointer"
          >
            Maintenance rapide (15 min)
          </button>
          <button
            type="button"
            onClick={() => applyQuickPreset('stop')}
            className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-bold text-rose-300 transition-colors cursor-pointer"
          >
            Arrêt complet manuel
          </button>
        </div>
      </section>

      {/* STEP 1: CAUSE, VERSION TARGET & EXTENDED MESSAGE */}
      <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4">
        <div className="border-b border-neutral-800/80 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Power className="h-4 w-4 text-[#facc15]" />
            <span>1. Raison du blocage & Informations affichées</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Choisissez le type de pause, indiquez la nouvelle version si besoin, et rédigez vos explications.
          </p>
        </div>

        {/* Mode Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {(Object.keys(SITE_PAUSE_MODE_META) as SitePauseMode[]).map((mKey) => {
            const meta = SITE_PAUSE_MODE_META[mKey];
            const isSelected = draft.mode === mKey;
            return (
              <button
                key={mKey}
                type="button"
                onClick={() => handleSelectMode(mKey)}
                className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#facc15] bg-[#facc15]/10 text-white shadow-md'
                    : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
              >
                {modeIcons[mKey]}
                <span className="text-center leading-tight">{meta.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Upcoming Version Input (Highlighted cleanly when mode === 'mise_a_jour', always editable if needed) */}
        <div
          className={`rounded-xl border p-4 space-y-2 transition-colors ${
            draft.mode === 'mise_a_jour'
              ? 'border-sky-500/40 bg-sky-950/20'
              : 'border-neutral-800/80 bg-neutral-950/60'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-neutral-200 flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-sky-400" />
              <span>
                {draft.mode === 'mise_a_jour'
                  ? 'Nouvelle version en cours de déploiement'
                  : 'Numéro de version associé (optionnel)'}
              </span>
            </label>
            <span className="text-[11px] text-neutral-400">
              Affiché en haut de l&apos;écran de pause
            </span>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-xs font-mono font-bold text-sky-400">
              v
            </span>
            <input
              type="text"
              maxLength={32}
              value={draft.upcomingVersion || ''}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, upcomingVersion: e.target.value }))
              }
              placeholder="Ex : 1.2.0 (laisser vide si non applicable)"
              className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] pl-7 pr-3.5 py-2.5 text-xs font-mono font-bold text-white placeholder:font-sans placeholder:font-normal placeholder:text-neutral-500 focus:border-sky-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Title, Main Message & Extended Details */}
        <div className="grid grid-cols-1 gap-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-neutral-300">
                Titre affiché aux visiteurs
              </label>
              <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                {draft.customTitle.length}/120
              </span>
            </div>
            <input
              type="text"
              maxLength={120}
              value={draft.customTitle}
              onChange={(e) => setDraft((prev) => ({ ...prev, customTitle: e.target.value }))}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-white focus:border-[#facc15] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-neutral-300">
                Message principal de pause
              </label>
              <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                {draft.customMessage.length}/2000
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={2000}
              value={draft.customMessage}
              onChange={(e) => setDraft((prev) => ({ ...prev, customMessage: e.target.value }))}
              placeholder="Expliquez pourquoi le site est en pause et ce que vous préparez..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none resize-y leading-relaxed"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-neutral-300 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[#facc15]" />
                <span>Informations détaillées / Notes supplémentaires (optionnel)</span>
              </label>
              <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                {(draft.extendedDetails || '').length}/2500
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={2500}
              value={draft.extendedDetails || ''}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, extendedDetails: e.target.value }))
              }
              placeholder="Listez par exemple les nouveautés en cours d'installation, les changements prévus, ou un message détaillé pour les visiteurs..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-white placeholder-neutral-600 focus:border-[#facc15] focus:outline-none resize-y leading-relaxed"
            />
          </div>
        </div>
      </section>

      {/* STEP 2: WHEN IT STARTS & WHEN IT RESUMES */}
      <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-5">
        <div className="border-b border-neutral-800/80 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Timer className="h-4 w-4 text-[#facc15]" />
            <span>2. Quand bloquer et quand rouvrir le site</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            {scheduleSummaryText}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          {/* Stop Timing */}
          <div className="space-y-3">
            <span className="font-bold text-neutral-200 block">Début du blocage :</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'immediate', label: 'Tout de suite', icon: <PowerOff className="h-3.5 w-3.5" /> },
                  { id: 'countdown', label: 'Dans X min', icon: <Clock className="h-3.5 w-3.5" /> },
                  { id: 'exact_date', label: 'Date précise', icon: <Calendar className="h-3.5 w-3.5" /> },
                ] as { id: ScheduleType; label: string; icon: React.ReactNode }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, scheduleType: opt.id }))}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    draft.scheduleType === opt.id
                      ? 'border-[#facc15] bg-[#facc15]/10 text-white'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                  }`}
                >
                  <span className="text-[#facc15]">{opt.icon}</span>
                  <span className="font-bold">{opt.label}</span>
                </button>
              ))}
            </div>

            {draft.scheduleType === 'countdown' && (
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-neutral-300">Attente avant blocage (min) :</span>
                  <div className="flex items-center gap-1">
                    {[1, 5, 10, 15, 30].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, countdownMinutes: m }))}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                          draft.countdownMinutes === m
                            ? 'bg-[#facc15] text-black'
                            : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={draft.countdownMinutes}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, countdownMinutes: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                />
              </div>
            )}

            {draft.scheduleType === 'exact_date' && (
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
                <label className="block font-semibold text-neutral-300">
                  Date et heure précises d&apos;arrêt :
                </label>
                <input
                  type="datetime-local"
                  value={exactPauseInput}
                  onChange={(e) => setExactPauseInput(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                />
              </div>
            )}

            {draft.scheduleType !== 'immediate' && (
              <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
                <div>
                  <span className="font-semibold text-neutral-200 block">Avertir avant l&apos;arrêt</span>
                  <span className="text-[11px] text-neutral-400">
                    Affiche un compte à rebours en haut du site
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={draft.showCountdownBanner}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, showCountdownBanner: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#facc15]"
                />
              </label>
            )}
          </div>

          {/* Resume Timing */}
          <div className="space-y-3">
            <span className="font-bold text-neutral-200 block">Fin / Réouverture prévue :</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'manual', label: 'Manuelle' },
                  { id: 'duration', label: 'Durée (min)' },
                  { id: 'exact_date', label: 'Heure précise' },
                ] as { id: ResumeType; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, resumeType: opt.id }))}
                  className={`px-3 py-2.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                    draft.resumeType === opt.id
                      ? 'border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {draft.resumeType === 'duration' && (
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-semibold text-neutral-300">Durée de la pause (min) :</label>
                  <div className="flex items-center gap-1">
                    {[10, 15, 30, 60, 120].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, resumeDurationMinutes: m }))}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                          draft.resumeDurationMinutes === m
                            ? 'bg-[#10b981] text-black'
                            : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={43200}
                  value={draft.resumeDurationMinutes}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      resumeDurationMinutes: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                />
              </div>
            )}

            {draft.resumeType === 'exact_date' && (
              <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2">
                <label className="block font-semibold text-neutral-300">Date et heure de reprise prévue :</label>
                <input
                  type="datetime-local"
                  value={exactResumeInput}
                  onChange={(e) => setExactResumeInput(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-[#0b0e14] px-3 py-2 text-white font-mono"
                />
              </div>
            )}

            {draft.resumeType !== 'manual' && (
              <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
                <div>
                  <span className="font-semibold text-neutral-200 block">Rouvrir automatiquement à la fin</span>
                  <span className="text-[11px] text-neutral-400">
                    Débloque le site automatiquement dès la fin du délai
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={draft.autoResume}
                  onChange={(e) => setDraft((prev) => ({ ...prev, autoResume: e.target.checked }))}
                  className="h-4 w-4 accent-[#10b981]"
                />
              </label>
            )}
          </div>
        </div>
      </section>

      {/* STEP 3: COLLAPSIBLE ADVANCED TARGETING */}
      <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Laptop className="h-4 w-4 text-[#facc15] shrink-0" />
              <span>3. Qui est bloqué ? (Appareils, Iframes & IPs)</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1 truncate">
              {targetingSummaryText}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#facc15] shrink-0">
            <span>{advancedOpen ? 'Masquer' : 'Personnaliser'}</span>
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {advancedOpen && (
          <div className="p-5 sm:p-6 pt-0 border-t border-neutral-800/80 grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            {/* Devices + Iframes */}
            <div className="space-y-4 pt-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-200">Appareils ciblés :</span>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[#facc15] font-bold">
                    <input
                      type="checkbox"
                      checked={draft.devices.all}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          devices: {
                            all: e.target.checked,
                            desktop: e.target.checked ? true : prev.devices.desktop,
                            mobile: e.target.checked ? true : prev.devices.mobile,
                            tablet: e.target.checked ? true : prev.devices.tablet,
                          },
                        }))
                      }
                      className="h-4 w-4 accent-[#facc15]"
                    />
                    <span>Tous les appareils</span>
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'desktop' as const, label: 'PC / Desktop', icon: <Monitor className="h-4 w-4" /> },
                    { key: 'mobile' as const, label: 'Mobile', icon: <Smartphone className="h-4 w-4" /> },
                    { key: 'tablet' as const, label: 'Tablette', icon: <Tablet className="h-4 w-4" /> },
                  ].map((dev) => {
                    const active = draft.devices.all || draft.devices[dev.key];
                    return (
                      <button
                        key={dev.key}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => {
                            const nextVal = !active;
                            const nextDevices = {
                              ...prev.devices,
                              all: false,
                              [dev.key]: nextVal,
                            };
                            if (nextDevices.desktop && nextDevices.mobile && nextDevices.tablet) {
                              nextDevices.all = true;
                            }
                            return { ...prev, devices: nextDevices };
                          })
                        }
                        className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                          active
                            ? 'border-[#ef4444]/50 bg-[#ef4444]/15 text-white'
                            : 'border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {dev.icon}
                        <span>{dev.label}</span>
                        <span className="text-[10px] font-mono">
                          {active ? 'Bloqué' : 'Autorisé'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-neutral-800/80">
                <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                  <Code2 className="h-3.5 w-3.5 text-[#facc15]" />
                  <span>Intégrations Iframe :</span>
                </span>
                <div className="space-y-2">
                  {(
                    [
                      {
                        id: 'block_all',
                        label: 'Bloquer le site ET les Iframes',
                        desc: 'Pause complète partout',
                      },
                      {
                        id: 'block_only_iframes',
                        label: 'Bloquer UNIQUEMENT les Iframes',
                        desc: 'Navigation directe ouverte, intégrations bloquées',
                      },
                      {
                        id: 'allow_iframes',
                        label: 'Autoriser les Iframes (bloquer le site direct)',
                        desc: 'Seul l’accès direct est mis en pause',
                      },
                    ] as { id: IframePolicy; label: string; desc: string }[]
                  ).map((pol) => (
                    <button
                      key={pol.id}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, iframePolicy: pol.id }))}
                      className={`w-full p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        draft.iframePolicy === pol.id
                          ? 'border-[#facc15] bg-[#facc15]/10 text-white'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold">{pol.label}</div>
                      <div className="text-[11px] text-neutral-400">{pol.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* IP Filtering & Admin Bypass */}
            <div className="space-y-3 pt-4">
              <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[#facc15]" />
                <span>Filtrage par Adresses IP & Accès Admin :</span>
              </span>

              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    { id: 'all', label: 'Bloquer toutes les adresses IP' },
                    { id: 'except_list', label: 'Bloquer tout SAUF ma liste blanche' },
                    { id: 'only_list', label: 'Bloquer UNIQUEMENT les IP de la liste' },
                  ] as { id: IpPolicyMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        ipPolicy: { ...prev.ipPolicy, mode: mode.id },
                      }))
                    }
                    className={`px-3 py-2 rounded-xl border text-left font-semibold transition-colors cursor-pointer ${
                      draft.ipPolicy.mode === mode.id
                        ? 'border-[#facc15] bg-[#facc15]/10 text-white'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {draft.ipPolicy.mode !== 'all' && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIpInput}
                      onChange={(e) => setNewIpInput(e.target.value)}
                      placeholder="Ex : 82.64.12.34"
                      className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-white font-mono focus:border-[#facc15] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleDetectIp}
                      disabled={isDetectingIp}
                      className="px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-neutral-200 font-semibold shrink-0 cursor-pointer"
                    >
                      {isDetectingIp ? '...' : 'Mon IP'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddTargetIp}
                      className="px-3 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black font-bold shrink-0 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Ajouter</span>
                    </button>
                  </div>

                  <div className="max-h-28 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/70 divide-y divide-neutral-800/70">
                    {draft.ipPolicy.ips.length === 0 ? (
                      <p className="p-3 text-center text-neutral-500 font-mono">
                        Aucune IP dans la liste.
                      </p>
                    ) : (
                      draft.ipPolicy.ips.map((ip) => (
                        <div key={ip} className="flex items-center justify-between px-3 py-2 font-mono">
                          <span className="text-neutral-200">{ip}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTargetIp(ip)}
                            className="text-neutral-500 hover:text-[#ef4444] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isCurrentIpTrusted && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-2 text-[11px] text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    Votre réseau ({detectedDevice}) utilise une IP de confiance Admin ({currentClientIp}).{' '}
                    {draft.ipPolicy.exemptTrustedAdminIps
                      ? 'Les autres appareils sur le même Wi-Fi seront aussi exemptés.'
                      : 'L’exemption IP est désactivée : même ce Wi-Fi suivra vos règles.'}
                  </span>
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
                <div>
                  <span className="font-semibold text-neutral-200 block">Exempter mes IP de confiance ({trustedIps.length})</span>
                  <span className="text-[11px] text-neutral-400">
                    Laisse passer votre box Wi-Fi même sans connexion A2F
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={draft.ipPolicy.exemptTrustedAdminIps}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      ipPolicy: { ...prev.ipPolicy, exemptTrustedAdminIps: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 accent-[#10b981]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950 cursor-pointer">
                <div>
                  <span className="font-semibold text-neutral-200 block">Bypass Administrateur (session A2F)</span>
                  <span className="text-[11px] text-neutral-400">
                    Vous garde l&apos;accès complet au site pendant la pause
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={draft.allowAdminBypass}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, allowAdminBypass: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#facc15]"
                />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* UNIFIED FINAL ACTION BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-[#0b0e14] p-4 sm:p-5">
        <div className="text-xs text-neutral-400">
          {JSONBIN_TEMPORARILY_DISABLED ? (
            <>
              Les changements sont propagés en temps réel via <strong className="text-neutral-200">Firebase</strong> (JSONBin archivé).
            </>
          ) : (
            <>
              Les changements sont propagés en temps réel via <strong className="text-neutral-200">Firebase</strong> et <strong className="text-neutral-200">JSONBin</strong>.
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {currentConfig.enabled && (
            <button
              type="button"
              onClick={() => handleSaveAndApply(false)}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[#10b981]/40 bg-[#10b981]/15 hover:bg-[#10b981]/25 text-[#10b981] text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Remettre En Ligne</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSaveAndApply(true)}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold transition-colors disabled:opacity-50 cursor-pointer"
          >
            <PauseCircle className="h-4 w-4" />
            <span>
              {isSaving
                ? 'Application...'
                : currentConfig.enabled
                ? 'Mettre à jour la pause'
                : draft.scheduleType === 'immediate'
                ? 'Mettre le site en pause maintenant'
                : 'Enregistrer & Lancer la planification'}
            </span>
          </button>
        </div>
      </div>

      {/* LIVE VISITOR SCREEN PREVIEW MODAL */}
      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Aperçu écran visiteur"
          onClick={() => setPreviewOpen(false)}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-3xl border border-neutral-800 bg-[#0b0e14] p-6 sm:p-8 shadow-2xl space-y-5 text-center"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 text-left">
              <span className="text-xs font-bold text-[#facc15] flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span>Aperçu exact vu par les visiteurs</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewOpen(false);
                }}
                aria-label="Fermer l'aperçu"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs font-bold tracking-wider text-neutral-400 flex items-center justify-center gap-2">
              <span>ROAD TO 2000 ELO</span>
              <span aria-hidden="true">·</span>
              <span style={{ color: draftMeta.accentHex }}>{draftMeta.label}</span>
            </div>

            {cleanUpcomingVersion && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl border border-sky-500/35 bg-sky-500/10 text-sky-300 text-xs font-mono font-bold">
                <Tag className="h-3.5 w-3.5 text-sky-400" />
                <span>
                  {draft.mode === 'mise_a_jour'
                    ? `Nouvelle version en déploiement : v${cleanUpcomingVersion}`
                    : `Version cible : v${cleanUpcomingVersion}`}
                </span>
              </div>
            )}

            <div className="space-y-2.5">
              <h4 className="text-xl sm:text-2xl font-bold text-white">
                {draft.customTitle || draftMeta.defaultTitle}
              </h4>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
                {draft.customMessage || draftMeta.defaultMessage}
              </p>
            </div>

            {(draft.extendedDetails || '').trim() && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left space-y-1.5">
                <div className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-[#facc15]" />
                  <span>Informations complémentaires</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
                  {(draft.extendedDetails || '').trim()}
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Bouton « Accès Admin » discret en bas de page</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-bold cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
