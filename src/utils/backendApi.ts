/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smart Express API detector & circuit-breaker.
 * Prevents repeated HTTP 404 console errors when the app is deployed as a static SPA
 * (e.g., on Vercel `*.vercel.app` where `server.ts` is not running),
 * while preserving full `/api/*` support on AI Studio and local Express servers.
 */

const SESSION_FLAG_KEY = 'roadto2000_express_backend_mode_v1';

type BackendState = 'unknown' | 'available' | 'unavailable';

let backendState: BackendState = detectInitialBackendState();

function detectInitialBackendState(): BackendState {
  if (typeof window === 'undefined') return 'unavailable';
  try {
    const host = (window.location?.hostname || '').toLowerCase();
    // Vercel static builds (`vercel.json` outputs static `dist/`) have no `/api` serverless functions
    if (host.endsWith('.vercel.app')) {
      return 'unavailable';
    }
    const cached = window.sessionStorage?.getItem(SESSION_FLAG_KEY);
    if (cached === 'available') return 'available';
    if (cached === 'unavailable') return 'unavailable';
  } catch {}
  return 'unknown';
}

export function isExpressBackendSupported(): boolean {
  return backendState !== 'unavailable';
}

export function getBackendHostMode(): 'express' | 'static' | 'checking' {
  if (backendState === 'available') return 'express';
  if (backendState === 'unavailable') return 'static';
  return 'checking';
}

export function markExpressBackendAvailable(): void {
  backendState = 'available';
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_FLAG_KEY, 'available');
    }
  } catch {}
}

export function markExpressBackendUnavailable(): void {
  backendState = 'unavailable';
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_FLAG_KEY, 'unavailable');
    }
  } catch {}
}

/**
 * Executes `fetch` against a local `/api/*` Express route ONLY if Express backend is reachable.
 * Returns `null` immediately on static deployments (like Vercel) so the browser never emits 404s.
 * If an unexpected 404 / HTML SPA fallback is returned, disables further `/api/*` probes for this session.
 */
export async function safeApiFetch(
  input: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response | null> {
  if (typeof fetch === 'undefined' || !isExpressBackendSupported()) {
    return null;
  }

  const controller = !init?.signal ? new AbortController() : null;
  const timeoutMs = init?.timeoutMs ?? 4500;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(input, {
      ...init,
      signal: init?.signal || controller?.signal,
    });

    if (res.status === 404) {
      markExpressBackendUnavailable();
      return null;
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Static SPA routers often rewrite unknown `/api/*` paths to `index.html` (200 text/html)
    if (ct.includes('text/html')) {
      markExpressBackendUnavailable();
      return null;
    }

    if (res.ok) {
      markExpressBackendAvailable();
    }
    return res;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
