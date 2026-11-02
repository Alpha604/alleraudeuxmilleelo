/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthSession {
  sessionId: string;
  scanning: boolean;
  ipPrefix: string;
  detectedIp: string;
  unlocked: boolean;
  unlockReason?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory session store
const sessions = new Map<string, AuthSession>();

// Active SSE client connections per sessionId
type SSEListener = (session: AuthSession) => void;
const sessionListeners = new Map<string, Set<SSEListener>>();

function addSessionListener(sessionId: string, listener: SSEListener) {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Set());
  }
  sessionListeners.get(sessionId)!.add(listener);
}

function removeSessionListener(sessionId: string, listener: SSEListener) {
  const set = sessionListeners.get(sessionId);
  if (set) {
    set.delete(listener);
    if (set.size === 0) {
      sessionListeners.delete(sessionId);
    }
  }
}

function broadcastSessionUpdate(session: AuthSession) {
  const set = sessionListeners.get(session.sessionId);
  if (set) {
    for (const listener of set) {
      try {
        listener(session);
      } catch (err) {
        console.warn('SSE broadcast error:', err);
      }
    }
  }
}

// Helper to mask IP prefix (e.g., 82.64.12.34 -> 82.64.***)
function formatIpPrefix(ip: string): string {
  const clean = ip.trim();
  if (!clean) return '***';
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}.***`;
    }
  } else if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:***`;
    }
  }
  return clean.substring(0, Math.min(clean.length, 6)) + '***';
}

// Extract real client IP from Express request
function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    ip = forwarded[0].trim();
  } else {
    ip = req.socket.remoteAddress || '';
  }
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip;
}

// Find local LAN IPv4 address (e.g. 192.168.1.45)
function getLocalLanIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return '127.0.0.1';
}

// Periodic cleanup of sessions older than 45 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 45 * 60 * 1000) {
      sessions.delete(id);
      sessionListeners.delete(id);
    }
  }
}, 10 * 60 * 1000);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const HOST = '0.0.0.0';

  app.use(express.json());

  // 1. Client IP lookup endpoint
  app.get('/api/auth/client-ip', (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    res.json({
      ip,
      ipPrefix: formatIpPrefix(ip),
    });
  });

  // 2. Server info (LAN address for seamless mobile QR scan on local network)
  app.get('/api/auth/server-info', (_req: Request, res: Response) => {
    const lanIp = getLocalLanIp();
    res.json({
      lanIp,
      port: PORT,
    });
  });

  // 3. Initialize auth session (called by desktop PC when opening 2FA modal)
  app.post('/api/auth/session/init', (req: Request, res: Response) => {
    const { sessionId } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        scanning: false,
        ipPrefix: '',
        detectedIp: '',
        unlocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, session);
    }

    res.json({ success: true, session });
  });

  // 4. Smartphone reports QR code scan start (live presence detection)
  app.post('/api/auth/session/scan', (req: Request, res: Response) => {
    const { sessionId, ipPrefix: reportedPrefix, clientIp: reportedIp } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const serverDetectedIp = extractClientIp(req);
    const effectiveIp = reportedIp || serverDetectedIp;
    const effectivePrefix = reportedPrefix || formatIpPrefix(effectiveIp);

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        scanning: true,
        ipPrefix: effectivePrefix,
        detectedIp: effectiveIp,
        unlocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      session.scanning = true;
      session.ipPrefix = effectivePrefix;
      session.detectedIp = effectiveIp;
      session.updatedAt = Date.now();
    }

    sessions.set(sessionId, session);
    broadcastSessionUpdate(session);

    res.json({
      success: true,
      sessionId,
      ip: effectiveIp,
      ipPrefix: effectivePrefix,
      scanning: true,
    });
  });

  // 5. Smartphone unlocks remote session (after typing password or trusted IP)
  app.post('/api/auth/session/unlock', (req: Request, res: Response) => {
    const { sessionId, reason } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        scanning: true,
        ipPrefix: '',
        detectedIp: '',
        unlocked: true,
        unlockReason: reason || 'remote',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      session.unlocked = true;
      session.unlockReason = reason || 'remote';
      session.updatedAt = Date.now();
    }

    sessions.set(sessionId, session);
    broadcastSessionUpdate(session);

    res.json({
      success: true,
      sessionId,
      unlocked: true,
      reason: session.unlockReason,
    });
  });

  // 6. Polling endpoint for session status
  app.get('/api/auth/session/status', (req: Request, res: Response) => {
    const sessionId = String(req.query.sessionId || '');
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.json({
        sessionId,
        scanning: false,
        ipPrefix: '',
        unlocked: false,
      });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      scanning: session.scanning,
      ipPrefix: session.ipPrefix,
      detectedIp: session.detectedIp,
      unlocked: session.unlocked,
      unlockReason: session.unlockReason,
      updatedAt: session.updatedAt,
    });
  });

  // 7. Server-Sent Events (SSE) stream for instant real-time push to desktop
  app.get('/api/auth/session/events', (req: Request, res: Response) => {
    const sessionId = String(req.query.sessionId || '');
    if (!sessionId) {
      res.status(400).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send immediate initial status
    const current = sessions.get(sessionId) || {
      sessionId,
      scanning: false,
      ipPrefix: '',
      detectedIp: '',
      unlocked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    res.write(`data: ${JSON.stringify(current)}\n\n`);

    const listener: SSEListener = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    addSessionListener(sessionId, listener);

    req.on('close', () => {
      removeSessionListener(sessionId, listener);
    });
  });

  // 8. Chess.com API proxy route
  app.get('/api/chess-proxy/*', async (req: Request, res: Response) => {
    try {
      const subpath = req.url.replace(/^\/api\/chess-proxy/, '');
      const targetUrl = `https://api.chess.com/pub${subpath}`;
      const chessRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'RoadTo2000EloApp (contact: contact@roadto2000.app)',
          'Accept': 'application/json',
        },
      });

      const data = await chessRes.text();
      res
        .status(chessRes.status)
        .setHeader('Content-Type', chessRes.headers.get('content-type') || 'application/json')
        .send(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Chess proxy error' });
    }
  });

  // 9. Vite Dev Middleware / Production Static Server
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[RoadTo2000] Full-Stack server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[RoadTo2000] Server failed to start:', err);
  process.exit(1);
});
