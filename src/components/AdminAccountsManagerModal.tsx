/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Crown,
  KeyRound,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AccountStatus,
  deleteManagedAccount,
  getPublicAuthorizedAccounts,
  regenerateAccountTotp,
  setAccountStatus,
} from '../utils/security';

interface AdminAccountsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateAccount: () => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'warning', title?: string) => void;
}

export const AdminAccountsManagerModal: React.FC<AdminAccountsManagerModalProps> = ({
  isOpen,
  onClose,
  onOpenCreateAccount,
  onNotify,
}) => {
  const [accounts, setAccounts] = useState<{ username: string; status: AccountStatus; isMaster: boolean }[]>([]);
  const [totpModalData, setTotpModalData] = useState<{
    username: string;
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);

  const refreshAccountsList = () => {
    const list = getPublicAuthorizedAccounts();
    setAccounts(list);
  };

  useEffect(() => {
    if (isOpen) {
      refreshAccountsList();
      setTotpModalData(null);
      setConfirmDeleteUser(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStatusChange = (username: string, newStatus: AccountStatus) => {
    if (username.toLowerCase() === 'alpharomeo1500') {
      onNotify('Le compte maître AlphaRoméo ne peut pas être modifié.', 'warning', 'Action impossible');
      return;
    }
    const success = setAccountStatus(username, newStatus);
    if (success) {
      refreshAccountsList();
      const labels: Record<AccountStatus, string> = {
        active: 'réactivé',
        suspended: 'suspendu',
        banned: 'banni',
      };
      onNotify(
        `Le compte @${username} a été ${labels[newStatus]} avec succès.`,
        newStatus === 'active' ? 'success' : 'warning',
        'Statut mis à jour'
      );
    }
  };

  const handleRegenerateTotp = async (username: string) => {
    try {
      const res = await regenerateAccountTotp(username);
      setTotpModalData({
        username,
        secret: res.secret,
        qrDataUrl: res.qrDataUrl,
      });
      onNotify(
        `Nouvelle clé A2F générée pour @${username}. Scannez le nouveau QR code.`,
        'success',
        'A2F Régénérée'
      );
    } catch {
      onNotify("Erreur lors de la régénération de l'A2F.", 'warning');
    }
  };

  const handleDelete = (username: string) => {
    if (username.toLowerCase() === 'alpharomeo1500') {
      onNotify('Le compte maître AlphaRoméo ne peut pas être supprimé.', 'warning', 'Action impossible');
      return;
    }
    const success = deleteManagedAccount(username);
    if (success) {
      setConfirmDeleteUser(null);
      refreshAccountsList();
      onNotify(`Le compte @${username} a été supprimé définitivement.`, 'success', 'Compte supprimé');
    }
  };

  const copySecretToClipboard = (secret: string) => {
    navigator.clipboard.writeText(secret).then(() => {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      onNotify('Clé secrète copiée dans le presse-papier !', 'info');
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl border border-neutral-800 bg-[#0c0f14] shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-[#07090e]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#facc15]/10 border border-[#facc15]/30 flex items-center justify-center text-[#facc15] shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white font-display">
                  Gestion des Comptes & Joueurs
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#facc15]/20 text-[#facc15] font-black uppercase">
                  Admin Panel
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Supervisez les accès, gérez l'A2F, suspendez ou bannissez les comptes du projet.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 bg-neutral-900/40 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-neutral-400 flex items-center gap-2">
            <span>Total autorisés :</span>
            <span className="font-mono font-bold text-white bg-neutral-800 px-2 py-0.5 rounded-lg">
              {accounts.length}
            </span>
            <span className="text-[11px] text-neutral-500">
              (Seul AlphaRoméo peut créer ou révoquer les accès)
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreateAccount();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-black font-black text-xs transition-all active:scale-95 shadow-sm"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Nouveau Compte Joueur</span>
          </button>
        </div>

        {/* Content Table / List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
          {accounts.map((acc) => {
            const isAlpha = acc.username === 'alpharomeo1500';

            return (
              <div
                key={acc.username}
                className={`p-4 rounded-2xl border transition-all ${
                  isAlpha
                    ? 'border-[#facc15]/30 bg-[#facc15]/[0.03]'
                    : acc.status === 'banned'
                    ? 'border-[#ef4444]/40 bg-[#ef4444]/[0.04]'
                    : acc.status === 'suspended'
                    ? 'border-amber-500/40 bg-amber-500/[0.04]'
                    : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Account Identity */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isAlpha
                          ? 'bg-gradient-to-br from-[#facc15] to-[#ca8a04] text-black font-black shadow-md'
                          : 'bg-neutral-800 text-neutral-200'
                      }`}
                    >
                      {acc.username.substring(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white font-mono truncate">
                          @{acc.username}
                        </span>

                        {isAlpha ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#facc15]/20 text-[#facc15] font-black uppercase tracking-wider">
                            <Crown className="h-3 w-3" />
                            Maître (Inviolable)
                          </span>
                        ) : acc.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#10b981]/20 text-[#10b981] font-bold">
                            <CheckCircle2 className="h-3 w-3" />
                            Actif
                          </span>
                        ) : acc.status === 'suspended' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                            <PauseCircle className="h-3 w-3" />
                            Suspendu
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#ef4444]/20 text-[#ef4444] font-bold">
                            <Ban className="h-3 w-3" />
                            Banni
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-neutral-400 font-mono">
                        {isAlpha ? (
                          <span>Authentification Microsoft Authenticator / Clé Maître</span>
                        ) : (
                          <span>A2F Autonome isolée + Stockage JSONBin dédié</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Non-Admin accounts */}
                  {!isAlpha ? (
                    <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                      {/* Regenerate A2F */}
                      <button
                        type="button"
                        onClick={() => handleRegenerateTotp(acc.username)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 hover:border-[#facc15] text-neutral-300 hover:text-white text-xs font-semibold transition-all"
                        title="Régénérer une nouvelle clé A2F et afficher le QR code"
                      >
                        <QrCode className="h-3.5 w-3.5 text-[#facc15]" />
                        <span>Changer A2F</span>
                      </button>

                      {/* Status toggle actions */}
                      {acc.status === 'active' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(acc.username, 'suspended')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold transition-all"
                            title="Suspendre temporairement l'accès de ce compte"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                            <span>Suspendre</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(acc.username, 'banned')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-xs font-semibold transition-all"
                            title="Bannir définitivement ce compte"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            <span>Bannir</span>
                          </button>
                        </>
                      )}

                      {acc.status === 'suspended' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(acc.username, 'active')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] text-xs font-semibold transition-all"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            <span>Réactiver</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(acc.username, 'banned')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-xs font-semibold transition-all"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            <span>Bannir</span>
                          </button>
                        </>
                      )}

                      {acc.status === 'banned' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(acc.username, 'active')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#10b981]/40 bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] text-xs font-semibold transition-all"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Débannir & Réactiver</span>
                        </button>
                      )}

                      {/* Delete account with confirmation */}
                      {confirmDeleteUser === acc.username ? (
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#ef4444]/20 border border-[#ef4444]/40 animate-in fade-in">
                          <span className="text-[10px] text-[#ef4444] font-bold px-1">Confirmer ?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(acc.username)}
                            className="px-2 py-1 rounded-lg bg-[#ef4444] hover:bg-red-600 text-white font-black text-[10px]"
                          >
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser(null)}
                            className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white text-[10px]"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUser(acc.username)}
                          className="p-1.5 rounded-xl border border-neutral-800 hover:border-[#ef4444]/50 hover:bg-[#ef4444]/15 text-neutral-500 hover:text-[#ef4444] transition-all"
                          title="Supprimer définitivement ce compte"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#facc15] font-mono px-3 py-1 rounded-xl bg-[#facc15]/10 border border-[#facc15]/20">
                      Protégé
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal display for Regenerated A2F QR code */}
        {totpModalData && (
          <div className="p-4 border-t border-neutral-800 bg-[#07090e] space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-[#facc15]" />
                <h4 className="text-xs font-bold text-white">
                  Nouvelle Clé A2F pour @{totpModalData.username}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setTotpModalData(null)}
                className="text-xs text-neutral-400 hover:text-white"
              >
                Fermer l'aperçu QR
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-neutral-950/80 p-3 rounded-2xl border border-neutral-800">
              <div className="p-2 bg-white rounded-xl shadow-md shrink-0">
                <img
                  src={totpModalData.qrDataUrl}
                  alt="QR Code A2F"
                  className="h-28 w-28 object-contain"
                />
              </div>

              <div className="space-y-2 flex-1 text-xs">
                <p className="text-neutral-400 leading-relaxed text-[11px]">
                  Faites scanner ce QR code à l'utilisateur via Google Authenticator ou Microsoft Authenticator.
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[#facc15] font-mono font-bold tracking-widest text-xs flex-1">
                    {totpModalData.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copySecretToClipboard(totpModalData.secret)}
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                    title="Copier la clé secrète"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-[#07090e] flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#10b981]" />
            <span>Sécurité active : chaque joueur dispose de son propre environnement et A2F.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
