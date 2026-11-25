/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Flame,
  Globe,
  HelpCircle,
  Info,
  Pause,
  Play,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { FIREBASE_META, testConnection } from '../firebase';
import { formatJsonBinTimestamp } from '../utils/cloudSync';
import {
  clearConsoleLogs,
  ConsoleLogEntry,
  ConsoleLogLevel,
  ConsoleLogSource,
  getConsoleLogs,
  getSyncDiagnosticsSnapshot,
  isConsoleCapturePaused,
  pushConsoleLog,
  resolveAllConsoleLogs,
  resolveConsoleLog,
  setConsoleCapturePaused,
} from '../utils/syncDiagnostics';

interface ErrorConsolePanelProps {
  onShowMessage: (msg: string, type?: 'info' | 'success' | 'warning', title?: string) => void;
}

type LevelFilter = 'all' | ConsoleLogLevel;
type SourceGroupFilter = 'all' | 'firebase' | 'network' | 'runtime' | 'console';

export const ErrorConsolePanel: React.FC<ErrorConsolePanelProps> = ({ onShowMessage }) => {
  const [logs, setLogs] = useState<ConsoleLogEntry[]>(() => getConsoleLogs());
  const [capturePaused, setCapturePausedState] = useState<boolean>(() => isConsoleCapturePaused());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceGroupFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideResolved, setHideResolved] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showExplainBox, setShowExplainBox] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingFirestore, setTestingFirestore] = useState<boolean>(false);

  useEffect(() => {
    const syncLogs = () => {
      setLogs(getConsoleLogs());
      setCapturePausedState(isConsoleCapturePaused());
    };
    window.addEventListener('roadto2000:error-console-updated', syncLogs);
    return () => window.removeEventListener('roadto2000:error-console-updated', syncLogs);
  }, []);

  const counts = useMemo(() => {
    const activeErrors = logs.filter((l) => !l.resolved && l.level === 'error').length;
    const activeWarns = logs.filter((l) => !l.resolved && l.level === 'warn').length;
    const totalErrors = logs.filter((l) => l.level === 'error').length;
    const totalWarns = logs.filter((l) => l.level === 'warn').length;
    const totalInfos = logs.filter((l) => l.level === 'info').length;
    const unresolved = logs.filter((l) => !l.resolved).length;
    return { activeErrors, activeWarns, totalErrors, totalWarns, totalInfos, unresolved };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (hideResolved && entry.resolved) return false;
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (sourceFilter === 'firebase' && entry.source !== 'firebase' && entry.source !== 'sync') {
        return false;
      }
      if (sourceFilter === 'network' && entry.source !== 'network' && entry.source !== 'api') {
        return false;
      }
      if (sourceFilter === 'runtime' && entry.source !== 'runtime' && entry.source !== 'promise') {
        return false;
      }
      if (sourceFilter === 'console' && entry.source !== 'console') {
        return false;
      }
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.message.toLowerCase().includes(q) ||
        (entry.url || '').toLowerCase().includes(q) ||
        (entry.stack || '').toLowerCase().includes(q) ||
        entry.source.toLowerCase().includes(q)
      );
    });
  }, [logs, hideResolved, levelFilter, sourceFilter, searchQuery]);

  const handleTogglePause = () => {
    const next = !capturePaused;
    setConsoleCapturePaused(next);
    setCapturePausedState(next);
    onShowMessage(
      next ? 'Capture des nouvelles erreurs mise en pause.' : 'Capture temps réel reprise.',
      'info',
      'Console Erreurs'
    );
  };

  const handleRunFirestoreProbe = async () => {
    setTestingFirestore(true);
    try {
      const state = await testConnection();
      const snap = getSyncDiagnosticsSnapshot();
      pushConsoleLog({
        level: state === 'online' ? 'info' : 'warn',
        source: 'firebase',
        title: `Test Firestore : ${
          state === 'online'
            ? 'En ligne'
            : state === 'blocked'
            ? 'Bloqué côté client'
            : 'Hors ligne'
        }`,
        message:
          state === 'online'
            ? `Connexion directe à Firestore établie (${snap.firebase.latencyMs ?? '—'} ms). Base principale opérationnelle.`
            : snap.firebase.lastError || 'Firestore n’a pas pu répondre au test.',
        fingerprint: `probe_${state}_${Date.now()}`,
      });
      onShowMessage(
        state === 'online'
          ? `Firestore en ligne (${snap.firebase.latencyMs ?? '—'} ms).`
          : state === 'blocked'
          ? 'Canal Firestore bloqué par le navigateur/extension.'
          : 'Firestore hors ligne.',
        state === 'online' ? 'success' : 'warning',
        'Test Firestore'
      );
    } finally {
      setTestingFirestore(false);
    }
  };

  const handleCopyReport = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      projectId: FIREBASE_META.projectId,
      databaseId: FIREBASE_META.firestoreDatabaseId,
      diagnostics: getSyncDiagnosticsSnapshot(),
      consoleLogs: logs,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2200);
      onShowMessage('Rapport complet de la console copié.', 'success');
    } catch {}
  };

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      projectId: FIREBASE_META.projectId,
      databaseId: FIREBASE_META.firestoreDatabaseId,
      diagnostics: getSyncDiagnosticsSnapshot(),
      consoleLogs: logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roadto2000_console_erreurs_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowMessage('Journal console exporté au format JSON.', 'success');
  };

  const handleCopySingleEntry = async (entry: ConsoleLogEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getSourceLabel = (src: ConsoleLogSource): string => {
    switch (src) {
      case 'firebase':
        return 'Firebase';
      case 'sync':
        return 'Sync';
      case 'network':
        return 'Réseau';
      case 'api':
        return 'API';
      case 'runtime':
        return 'JS Runtime';
      case 'promise':
        return 'Promise';
      default:
        return 'Console';
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Overview & Action Toolbar */}
      <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-neutral-800/80">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#facc15]" />
              <span>Console d&apos;Erreurs &amp; Logs Système</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                  capturePaused
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    capturePaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                {capturePaused ? 'Capture en pause' : 'Capture en direct'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Capture automatique des erreurs JavaScript, rejets asynchrones,{' '}
              <code className="font-mono text-neutral-300">console.error/warn</code>, échecs réseau
              et alertes Firebase Firestore.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRunFirestoreProbe}
              disabled={testingFirestore}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-bold text-neutral-200 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#facc15] ${testingFirestore ? 'animate-spin' : ''}`}
              />
              <span>{testingFirestore ? 'Test...' : 'Tester Firestore'}</span>
            </button>

            <button
              type="button"
              onClick={handleTogglePause}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                capturePaused
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              {capturePaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              <span>{capturePaused ? 'Reprendre' : 'Pause'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-bold text-neutral-200 transition-colors"
            >
              {copiedReport ? (
                <Check className="h-3.5 w-3.5 text-[#10b981]" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[#facc15]" />
              )}
              <span>{copiedReport ? 'Copié' : 'Copier'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-bold text-neutral-200 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-neutral-400" />
              <span>Exporter</span>
            </button>

            {logs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearConsoleLogs();
                  onShowMessage('Console d’erreurs vidée.', 'info');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-xs font-bold text-[#ef4444] transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Vider</span>
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-neutral-400 block">Total capturé</span>
              <span className="text-xl font-bold font-mono tabular-nums text-white">
                {logs.length}
              </span>
            </div>
            <Terminal className="h-5 w-5 text-neutral-500" />
          </div>

          <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/[0.06] p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#ef4444] block">Erreurs actives</span>
              <span className="text-xl font-bold font-mono tabular-nums text-[#ef4444]">
                {counts.activeErrors}
              </span>
            </div>
            <XCircle className="h-5 w-5 text-[#ef4444]" />
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-amber-300 block">Alertes actives</span>
              <span className="text-xl font-bold font-mono tabular-nums text-amber-300">
                {counts.activeWarns}
              </span>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-300 block">Base Active</span>
              <span className="text-sm font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                <Flame className="h-4 w-4 shrink-0" />
                <span>Firebase</span>
              </span>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
        </div>

        {/* Built-in Reference Card: Write/channel TYPE=terminate ERR_BLOCKED_BY_CLIENT */}
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowExplainBox(!showExplainBox)}
            className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left text-xs font-bold text-sky-300 hover:bg-sky-500/10 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <HelpCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Explication : Firestore Write/channel?...&amp;TYPE=terminate (ERR_BLOCKED_BY_CLIENT)
              </span>
            </span>
            {showExplainBox ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
          </button>

          {showExplainBox && (
            <div className="px-4 pb-4 pt-1 border-t border-sky-500/20 text-xs text-neutral-300 space-y-2 leading-relaxed">
              <p>
                <strong className="text-white">Ce que fait cette requête :</strong> lorsque
                Firestore ferme ou réinitialise un canal d&apos;écriture en arrière-plan (par
                exemple au rechargement d&apos;onglet ou en fin de lot d&apos;écriture), le SDK
                envoie une requête <code className="font-mono text-sky-300">POST .../Write/channel?...&amp;TYPE=terminate</code> pour prévenir le serveur Google de libérer la session <code className="font-mono text-neutral-400">gsessionid</code>.
              </p>
              <p>
                <strong className="text-amber-300">Pourquoi « net::ERR_BLOCKED_BY_CLIENT » :</strong>{' '}
                ce code ne vient pas d&apos;une panne du site ni d&apos;une perte de données. C&apos;est
                votre navigateur ou une extension de blocage (uBlock Origin, AdGuard, Brave Shields,
                Privacy Badger) qui bloque cet appel de fermeture vers{' '}
                <code className="font-mono text-sky-300">firestore.googleapis.com</code>.
              </p>
              <p className="text-emerald-300">
                <strong>Solution appliquée + conseil :</strong> l&apos;application force désormais le mode{' '}
                <code className="font-mono">experimentalForceLongPolling</code> pour limiter les
                fermetures WebChannel. Pour supprimer totalement cet avertissement console sur votre
                navigateur, autorisez <code className="font-mono">firestore.googleapis.com</code> dans
                votre bloqueur.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Filters & Live Console Stream */}
      <section className="rounded-2xl border border-neutral-800/90 bg-[#0b0e14] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Level filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Tous (${logs.length})` },
                { id: 'error', label: `Erreurs (${counts.totalErrors})` },
                { id: 'warn', label: `Alertes (${counts.totalWarns})` },
                { id: 'info', label: `Infos (${counts.totalInfos})` },
              ] as { id: LevelFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLevelFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  levelFilter === tab.id
                    ? 'border-[#facc15]/50 bg-[#facc15]/15 text-[#facc15]'
                    : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Source filters + Search */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceGroupFilter)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-neutral-200 focus:border-[#facc15] focus:outline-none"
            >
              <option value="all">Toutes sources</option>
              <option value="firebase">Firebase / Sync</option>
              <option value="network">Réseau / API</option>
              <option value="runtime">JS Runtime / Promises</option>
              <option value="console">Console navigateur</option>
            </select>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-950 text-xs text-neutral-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideResolved}
                onChange={(e) => setHideResolved(e.target.checked)}
                className="accent-[#facc15]"
              />
              <span>Masquer résolus</span>
            </label>

            {counts.unresolved > 0 && (
              <button
                type="button"
                onClick={() => {
                  resolveAllConsoleLogs();
                  onShowMessage('Toutes les entrées ont été marquées comme résolues.', 'success');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-bold text-emerald-300 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Tout résoudre</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="h-4 w-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une erreur, URL, code HTTP, stack trace..."
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:border-[#facc15] focus:outline-none font-mono"
          />
        </div>

        {/* Entries List */}
        {filteredLogs.length === 0 ? (
          <div className="rounded-2xl border border-[#10b981]/25 bg-[#10b981]/[0.04] p-8 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-[#10b981] mx-auto" />
            <div className="text-sm font-bold text-white">Aucune entrée dans cette vue</div>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              Toute nouvelle erreur JavaScript, erreur réseau ou alerte Firestore apparaîtra ici en
              temps réel.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
            {filteredLogs.map((entry) => {
              const isExpanded = Boolean(expandedIds[entry.id]);
              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border p-3.5 space-y-2 transition-colors ${
                    entry.resolved
                      ? 'border-neutral-800/70 bg-neutral-950/50 opacity-70'
                      : entry.level === 'error'
                      ? 'border-[#ef4444]/40 bg-[#ef4444]/[0.07]'
                      : entry.level === 'warn'
                      ? 'border-amber-500/35 bg-amber-500/[0.06]'
                      : 'border-sky-500/30 bg-sky-500/[0.05]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {entry.resolved ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Résolu
                        </span>
                      ) : entry.level === 'error' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ef4444]/15 border border-[#ef4444]/35 text-[10px] font-bold text-[#ef4444]">
                          <XCircle className="h-3 w-3" />
                          Erreur
                        </span>
                      ) : entry.level === 'warn' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-[10px] font-bold text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          Alerte
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-[10px] font-bold text-sky-300">
                          <Info className="h-3 w-3" />
                          Info
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-md bg-black/50 border border-neutral-800 text-[10px] font-mono uppercase text-neutral-300">
                        {getSourceLabel(entry.source)}
                      </span>

                      {typeof entry.statusCode === 'number' && (
                        <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-700 text-[10px] font-mono font-bold text-white">
                          HTTP {entry.statusCode}
                        </span>
                      )}

                      {entry.count > 1 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono font-bold text-white">
                          ×{entry.count}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-neutral-400">
                        {formatJsonBinTimestamp(entry.lastSeenAt)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopySingleEntry(entry)}
                        title="Copier cette entrée JSON"
                        className="p-1 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-colors"
                      >
                        {copiedId === entry.id ? (
                          <Check className="h-3 w-3 text-[#10b981]" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>

                      {!entry.resolved && (
                        <button
                          type="button"
                          onClick={() => resolveConsoleLog(entry.id)}
                          className="px-2 py-0.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold text-emerald-300 transition-colors"
                        >
                          Résoudre
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white break-words">{entry.title}</div>
                    <p className="text-[11px] font-mono text-neutral-300 break-all leading-relaxed">
                      {entry.message}
                    </p>
                  </div>

                  {(entry.url || entry.stack) && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(entry.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:underline"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <span>{isExpanded ? 'Masquer détails techniques' : 'Voir détails & stack trace'}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          {entry.url && (
                            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-black/60 px-2.5 py-1.5 text-[10px] font-mono text-sky-300 break-all">
                              <Globe className="h-3 w-3 shrink-0 text-neutral-500" />
                              <span>{entry.url}</span>
                            </div>
                          )}
                          {entry.stack && (
                            <pre className="max-h-44 overflow-auto rounded-lg border border-neutral-800 bg-black/80 p-2.5 font-mono text-[10px] text-neutral-300 leading-relaxed whitespace-pre-wrap break-all scrollbar-thin">
                              {entry.stack}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
