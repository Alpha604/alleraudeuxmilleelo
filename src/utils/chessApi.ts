/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChessComProfileResponse, ChessComStatsResponse } from '../types/chess';

export interface FetchStatsResult {
  success: boolean;
  stats?: ChessComStatsResponse;
  profile?: ChessComProfileResponse;
  source: 'API Chess.com directe' | 'Proxy API' | 'Saisie manuelle';
  error?: string;
  statusCode?: number;
  timestamp: string;
}

const TIMEOUT_MS = 8000;

/**
 * Executes a fetch with a strict timeout using AbortController.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Attempts direct fetch first, then fallback to Vite /api/chess-proxy.
 */
export async function fetchChessComData(username: string): Promise<FetchStatsResult> {
  const sanitized = username.trim().toLowerCase();
  const now = new Date().toISOString();

  if (!sanitized) {
    return {
      success: false,
      source: 'API Chess.com directe',
      error: 'Veuillez saisir un nom d\'utilisateur Chess.com valide.',
      timestamp: now,
    };
  }

  const directStatsUrl = `https://api.chess.com/pub/player/${encodeURIComponent(sanitized)}/stats`;
  const directProfileUrl = `https://api.chess.com/pub/player/${encodeURIComponent(sanitized)}`;

  const proxyStatsUrl = `/api/chess-proxy/player/${encodeURIComponent(sanitized)}/stats`;
  const proxyProfileUrl = `/api/chess-proxy/player/${encodeURIComponent(sanitized)}`;

  // 1. Try Direct API fetch first
  try {
    const statsRes = await fetchWithTimeout(directStatsUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (statsRes.status === 404) {
      return {
        success: false,
        source: 'API Chess.com directe',
        statusCode: 404,
        error: `Joueur Chess.com "${sanitized}" introuvable (Erreur 404). Vérifiez l'orthographe du pseudo.`,
        timestamp: now,
      };
    }

    if (statsRes.status === 429) {
      return {
        success: false,
        source: 'API Chess.com directe',
        statusCode: 429,
        error: 'Limite de fréquence atteinte auprès de Chess.com (Rate Limit 429). Veuillez patienter quelques secondes avant de réactualiser.',
        timestamp: now,
      };
    }

    if (!statsRes.ok) {
      throw new Error(`HTTP ${statsRes.status} on direct API`);
    }

    const statsData: ChessComStatsResponse = await statsRes.json();

    // Optionally fetch profile for avatar & name
    let profileData: ChessComProfileResponse | undefined;
    try {
      const profRes = await fetchWithTimeout(directProfileUrl, { headers: { Accept: 'application/json' } }, 4000);
      if (profRes.ok) {
        profileData = await profRes.json();
      }
    } catch (e) {
      // Profile fetch is optional, non-blocking
      console.warn('Profile fetch warning (non-fatal):', e);
    }

    return {
      success: true,
      stats: statsData,
      profile: profileData,
      source: 'API Chess.com directe',
      statusCode: 200,
      timestamp: now,
    };
  } catch (directErr) {
    console.warn('Direct Chess.com API attempt failed, trying proxy fallback:', directErr);
  }

  // 2. Fallback to Proxy API
  try {
    const proxyRes = await fetchWithTimeout(proxyStatsUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (proxyRes.status === 404) {
      return {
        success: false,
        source: 'Proxy API',
        statusCode: 404,
        error: `Joueur Chess.com "${sanitized}" introuvable via proxy (Erreur 404).`,
        timestamp: now,
      };
    }

    if (proxyRes.status === 429) {
      return {
        success: false,
        source: 'Proxy API',
        statusCode: 429,
        error: 'Limite de fréquence atteinte sur l\'API Chess.com (Rate Limit). Réessayez dans un court instant.',
        timestamp: now,
      };
    }

    if (!proxyRes.ok) {
      throw new Error(`Proxy returned HTTP ${proxyRes.status}`);
    }

    const statsData: ChessComStatsResponse = await proxyRes.json();

    let profileData: ChessComProfileResponse | undefined;
    try {
      const profRes = await fetchWithTimeout(proxyProfileUrl, { headers: { Accept: 'application/json' } }, 4000);
      if (profRes.ok) {
        profileData = await profRes.json();
      }
    } catch {
      // Non-fatal
    }

    return {
      success: true,
      stats: statsData,
      profile: profileData,
      source: 'Proxy API',
      statusCode: 200,
      timestamp: now,
    };
  } catch (proxyErr) {
    console.error('All fetch attempts failed:', proxyErr);
    return {
      success: false,
      source: 'API Chess.com directe',
      error: 'Impossible de contacter l\'API Chess.com (erreur réseau ou service temporairement indisponible). Vos dernières données enregistrées restent consultables.',
      timestamp: now,
    };
  }
}
