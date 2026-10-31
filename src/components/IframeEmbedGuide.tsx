/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Layers,
  Monitor,
  Server,
  Smartphone,
  Tablet,
} from 'lucide-react';

export const IframeEmbedGuide: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'full' | 'tablet' | 'mobile'>('full');

  const currentAppUrl = typeof window !== 'undefined' ? window.location.origin : 'https://votre-domaine.com';

  const embedCode = `<iframe
  src="${currentAppUrl}"
  width="100%"
  height="900"
  style="border:0;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);"
  loading="lazy"
  allow="clipboard-write"
  title="Road to 2000 Elo — Application Chess Performance">
</iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 flex items-center gap-2">
          <Code2 className="h-5 w-5 text-amber-400" />
          <span>Intégration En Iframe & Guide D'Hébergement</span>
        </h2>
        <p className="text-xs text-neutral-400">
          Architecture optimisée pour être embarquée de façon fluide dans n'importe quel site web, blog ou dashboard tiers.
        </p>
      </div>

      {/* Embed Code Snippet Card */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/90 light:border-neutral-200 light:bg-white space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Code D'Intégration Iframe Standard
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Code copié !' : 'Copier le code'}</span>
          </button>
        </div>

        <pre className="overflow-x-auto rounded-xl bg-neutral-950 p-4 font-mono text-xs text-amber-300/90 border border-neutral-800/80">
          <code>{embedCode}</code>
        </pre>

        <p className="text-xs text-neutral-400">
          Copiez simplement ce bloc HTML dans votre page hôte (WordPress, Webflow, Notion embed, documentation ou site personnalisé).
        </p>
      </div>

      {/* Technical Specifications for Iframes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-200 uppercase tracking-wider">
            <Layers className="h-4 w-4 text-amber-400" />
            <span>Spécifications & Contraintes Respectées</span>
          </div>
          <ul className="space-y-2 text-xs text-neutral-300">
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">✓</span>
              <span><strong>Largeur 100% adaptative :</strong> Aucune largeur fixe rigide, s'étire selon le conteneur hôte.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">✓</span>
              <span><strong>Zéro débordement horizontal :</strong> Grilles fluides avec <code>overflow-x: hidden</code> sur le layout principal.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">✓</span>
              <span><strong>Support complet dès 320 px :</strong> Utilisable sur smartphones étroits, tablettes et grands écrans.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">✓</span>
              <span><strong>Autonomie sans popups :</strong> Toutes les fonctions (sync, export, graphiques, filtres) s'exécutent dans l'iframe sans ouvrir de fenêtre externe obligatoire.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-200 uppercase tracking-wider">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span>Gestion Du Stockage Dégradé (Fallback)</span>
          </div>
          <p className="text-xs text-neutral-300 leading-relaxed">
            Certains navigateurs (Safari ITP, Chrome Privacy Sandbox) restreignent le <code>localStorage</code> tiers dans les iframes cross-origin.
          </p>
          <div className="rounded-lg bg-neutral-950 p-3 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1.5">
            <div className="font-semibold text-amber-300">Résilience automatique intégrée :</div>
            <p>
              1. En cas de blocage de <code>localStorage</code>, l'application bascule automatiquement sur un <strong>stockage en mémoire vive (RAM Singleton)</strong> sans générer d'erreur JavaScript.
            </p>
            <p>
              2. L'export CSV et JSON reste opérationnel à tout moment pour sauvegarder les relevés.
            </p>
          </div>
        </div>
      </div>

      {/* Hosting & Deployment Instructions */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-neutral-200 uppercase tracking-wider">
          <Server className="h-4 w-4 text-amber-400" />
          <span>Instructions D'Hébergement & En-têtes HTTP</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h4 className="font-bold text-white mb-1">1. En-tête X-Frame-Options</h4>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              Pour autoriser l'affichage en iframe, votre serveur web ne doit pas envoyer <code>X-Frame-Options: DENY</code>. Préférez <code>Content-Security-Policy: frame-ancestors *</code> ou le domaine de votre site hôte.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h4 className="font-bold text-white mb-1">2. Déploiement Statique</h4>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              L'application compile en assets statiques HTML/JS/CSS ultra-légers via <code>npm run build</code>. Déployable instantanément sur Vercel, Netlify, Cloudflare Pages ou GitHub Pages.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h4 className="font-bold text-white mb-1">3. Connexion API Chess.com</h4>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              L'API publique Chess.com autorise le CORS avec <code>access-control-allow-origin: *</code>, ce qui permet des requêtes directes côté client depuis l'iframe sans nécessiter de serveur mandataire complexe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
