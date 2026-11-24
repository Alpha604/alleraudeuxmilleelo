/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  History,
  Layers,
  ShieldCheck,
  Sparkles,
  Tag,
  Wrench,
  X,
} from 'lucide-react';
import { ReleaseCategory, SiteReleaseEntry } from '../types/chess';
import { formatJsonBinTimestamp } from '../utils/cloudSync';
import { normalizeSiteVersion } from '../utils/storage';

interface ReleaseChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstVisit: boolean;
  currentVersion: string;
  releases: SiteReleaseEntry[];
  initialTab?: 'latest' | 'history';
}

const CATEGORY_META: Record<
  ReleaseCategory,
  { label: string; colorClass: string; icon: React.ReactNode }
> = {
  major: {
    label: 'Version Majeure',
    colorClass: 'text-[#facc15]',
    icon: <Crown className="h-3.5 w-3.5 text-[#facc15]" />,
  },
  feature: {
    label: 'Nouveautés',
    colorClass: 'text-sky-400',
    icon: <Sparkles className="h-3.5 w-3.5 text-sky-400" />,
  },
  improvement: {
    label: 'Améliorations',
    colorClass: 'text-emerald-400',
    icon: <Layers className="h-3.5 w-3.5 text-emerald-400" />,
  },
  fix: {
    label: 'Correctifs',
    colorClass: 'text-amber-400',
    icon: <Wrench className="h-3.5 w-3.5 text-amber-400" />,
  },
  security: {
    label: 'Sécurité',
    colorClass: 'text-rose-400',
    icon: <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />,
  },
};

export const ReleaseChangelogModal: React.FC<ReleaseChangelogModalProps> = ({
  isOpen,
  onClose,
  isFirstVisit,
  currentVersion,
  releases,
  initialTab = 'latest',
}) => {
  const [activeTab, setActiveTab] = useState<'latest' | 'history'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const latestRelease = useMemo(() => {
    if (releases.length > 0) return releases[0];
    const v = normalizeSiteVersion(currentVersion);
    return {
      id: `rel_${v}`,
      version: v,
      title: `Version v${v}`,
      category: 'feature' as ReleaseCategory,
      summary: 'Bienvenue sur Road to 2000 Elo.',
      changes: [],
      publishedAt: new Date().toISOString(),
    };
  }, [releases, currentVersion]);

  if (!isOpen) return null;

  const latestMeta = CATEGORY_META[latestRelease.category] || CATEGORY_META.feature;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-changelog-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-[125] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-card relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-3xl border border-neutral-800 bg-[#0b0e14] text-neutral-100 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800/90 px-5 sm:px-6 py-4 bg-[#0f131c]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#facc15]/15 border border-[#facc15]/30 text-[#facc15] shrink-0">
              {isFirstVisit ? <Crown className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2
                id="release-changelog-modal-title"
                className="text-base sm:text-lg font-bold text-white leading-tight truncate"
              >
                {isFirstVisit
                  ? 'Bienvenue sur Road to 2000 Elo'
                  : `Notes de version · v${normalizeSiteVersion(latestRelease.version)}`}
              </h2>
              <p className="text-xs text-neutral-400 truncate mt-0.5">
                Version active v{normalizeSiteVersion(currentVersion)}
                <span aria-hidden="true"> · </span>
                {releases.length} version{releases.length > 1 ? 's' : ''} publiée{releases.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Fermer la fenêtre des versions"
            title="Fermer (Échap)"
            className="relative z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors shrink-0 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Tab Switch */}
        <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-neutral-800/70 bg-[#0d1119] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('latest')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'latest'
                ? 'bg-[#facc15] text-black'
                : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Dernière version</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#facc15] text-black'
                : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Historique ({releases.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {activeTab === 'latest' ? (
            <div className="space-y-4">
              {isFirstVisit && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-[#facc15]">
                    Première connexion sur cet appareil
                  </p>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Retrouvez ici votre suivi quotidien Chess.com vers les 2000 Elo, l&apos;historique
                    de vos parties, la courbe d&apos;avance théorique et vos sauvegardes Cloud.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                    {latestMeta.icon}
                    <span className={latestMeta.colorClass}>{latestMeta.label}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-bold text-[#facc15] tabular-nums">
                    v{normalizeSiteVersion(latestRelease.version)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {formatJsonBinTimestamp(latestRelease.publishedAt)}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white leading-snug">
                  {latestRelease.title}
                </h3>

                {latestRelease.summary && (
                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
                    {latestRelease.summary}
                  </p>
                )}

                {latestRelease.changes.length > 0 && (
                  <div className="pt-2 border-t border-neutral-800/80 space-y-2.5">
                    <div className="text-xs font-semibold text-neutral-400">
                      Ce qui change dans cette version :
                    </div>
                    <ul className="space-y-2">
                      {latestRelease.changes.map((line, idx) => (
                        <li
                          key={`${latestRelease.id}_chg_${idx}`}
                          className="flex items-start gap-2.5 text-xs sm:text-sm text-neutral-200 leading-relaxed"
                        >
                          <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {releases.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-6">
                  Aucune version enregistrée dans l&apos;historique pour le moment.
                </p>
              ) : (
                releases.map((rel, index) => {
                  const meta = CATEGORY_META[rel.category] || CATEGORY_META.feature;
                  const isCurrent =
                    index === 0 ||
                    normalizeSiteVersion(rel.version) === normalizeSiteVersion(currentVersion);
                  return (
                    <article
                      key={rel.id}
                      className="pb-4 border-b border-neutral-800/80 last:border-b-0 last:pb-0 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-neutral-400">
                          <span className="font-mono font-bold text-[#facc15] tabular-nums">
                            v{normalizeSiteVersion(rel.version)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-semibold ${meta.colorClass}`}>{meta.label}</span>
                          {isCurrent && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-400 font-semibold">Actuelle</span>
                            </>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
                          {formatJsonBinTimestamp(rel.publishedAt)}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white">{rel.title}</h4>

                      {rel.summary && (
                        <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
                          {rel.summary}
                        </p>
                      )}

                      {rel.changes.length > 0 && (
                        <ul className="space-y-1.5 pt-1">
                          {rel.changes.map((item, idx) => (
                            <li
                              key={`${rel.id}_item_${idx}`}
                              className="flex items-start gap-2 text-xs text-neutral-300 leading-relaxed"
                            >
                              <span className="text-[#facc15] font-bold mt-0.5">-</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-neutral-800/80 px-5 sm:px-6 py-3.5 bg-[#0f131c]">
          <span className="text-[11px] text-neutral-500">
            Consultable à tout moment depuis le pied de page
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
};
