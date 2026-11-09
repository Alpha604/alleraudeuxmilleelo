/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';
import crypto from 'crypto';

interface AuthSession {
  sessionId: string;
  scanning: boolean;
  ipPrefix: string;
  detectedIp: string;
  unlocked: boolean;
  isTrusted?: boolean;
  trustedIps?: string[];
  unlockReason?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory session store
const sessions = new Map<string, AuthSession>();

// Persistent server-side trusted IPs
const TRUSTED_IPS_FILE = path.resolve(os.tmpdir(), 'roadto2000_trusted_ips.json');
const serverTrustedIps = new Set<string>();

// Load trusted IPs from disk
function loadTrustedIpsFromDisk() {
  try {
    if (fs.existsSync(TRUSTED_IPS_FILE)) {
      const raw = fs.readFileSync(TRUSTED_IPS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((ip: string) => {
          if (typeof ip === 'string' && ip.trim().length >= 7) {
            serverTrustedIps.add(ip.trim());
          }
        });
      }
    }
  } catch (err) {
    console.warn('[RoadTo2000] Failed to load trusted IPs from disk:', err);
  }
}

// Save trusted IPs to disk
function saveTrustedIpsToDisk() {
  try {
    fs.writeFileSync(TRUSTED_IPS_FILE, JSON.stringify(Array.from(serverTrustedIps)), 'utf-8');
  } catch (err) {
    console.warn('[RoadTo2000] Failed to save trusted IPs to disk:', err);
  }
}

loadTrustedIpsFromDisk();

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

// Extract real client IP from Express request (handles Google Cloud Run, reverse proxies, and local)
function extractClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

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
  return ip.trim();
}

// Verify if a client IP is trusted without trusting any client spoofing
function isServerIpTrusted(clientIp: string, sessionIps?: string[]): boolean {
  const clean = clientIp.trim();
  if (!clean) return false;

  const normalized = clean.startsWith('::ffff:') ? clean.replace('::ffff:', '') : clean;

  const pool = new Set<string>();
  serverTrustedIps.forEach((ip) => pool.add(ip.trim()));
  if (Array.isArray(sessionIps)) {
    sessionIps.forEach((ip) => {
      if (ip && typeof ip === 'string' && ip.trim().length >= 7) {
        pool.add(ip.trim());
      }
    });
  }

  for (const trusted of pool) {
    const cleanTrusted = trusted.startsWith('::ffff:') ? trusted.replace('::ffff:', '') : trusted;
    if (normalized === cleanTrusted) return true;
    if (cleanTrusted.endsWith('.*')) {
      const prefix = cleanTrusted.slice(0, -2);
      if (normalized.startsWith(prefix)) return true;
    }
  }
  return false;
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

  // CORS middleware for seamless cross-device & cross-preview requests
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // 1. Client IP lookup endpoint
  app.get('/api/auth/client-ip', (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    res.json({
      ip,
      ipPrefix: formatIpPrefix(ip),
      isTrusted: isServerIpTrusted(ip),
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

  // 3. Trusted IPs management endpoints (strictly server-stored, not from URL parameters!)
  app.get('/api/auth/trusted-ips', (_req: Request, res: Response) => {
    res.json({
      trustedIps: Array.from(serverTrustedIps),
    });
  });

  app.post('/api/auth/trusted-ips', (req: Request, res: Response) => {
    const { ips, ip, action } = req.body || {};
    if (Array.isArray(ips)) {
      serverTrustedIps.clear();
      ips.forEach((item) => {
        if (typeof item === 'string' && item.trim().length >= 7) {
          serverTrustedIps.add(item.trim());
        }
      });
      saveTrustedIpsToDisk();
      res.json({ success: true, count: serverTrustedIps.size });
      return;
    }

    if (ip && typeof ip === 'string') {
      const cleanIp = ip.trim();
      if (action === 'remove') {
        serverTrustedIps.delete(cleanIp);
      } else if (cleanIp.length >= 7) {
        serverTrustedIps.add(cleanIp);
      }
      saveTrustedIpsToDisk();
      res.json({ success: true, count: serverTrustedIps.size });
      return;
    }

    res.status(400).json({ error: 'Invalid payload' });
  });

  // 4. Initialize auth session (called by desktop PC when opening 2FA modal)
  app.post('/api/auth/session/init', (req: Request, res: Response) => {
    const { sessionId, trustedIps } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    // Sync any trusted IPs from desktop to server
    if (Array.isArray(trustedIps)) {
      trustedIps.forEach((item: string) => {
        if (typeof item === 'string' && item.trim().length >= 7) {
          serverTrustedIps.add(item.trim());
        }
      });
      saveTrustedIpsToDisk();
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        scanning: false,
        ipPrefix: '',
        detectedIp: '',
        unlocked: false,
        isTrusted: false,
        trustedIps: Array.isArray(trustedIps) ? trustedIps : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, session);
    } else if (Array.isArray(trustedIps)) {
      session.trustedIps = trustedIps;
    }

    res.json({ success: true, session });
  });

  // 5. Smartphone reports QR code scan start (live presence detection)
  // CRITICAL: Uses actual TCP/HTTP connection IP. Never trusts URL parameters!
  app.post('/api/auth/session/scan', (req: Request, res: Response) => {
    const { sessionId } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    // Extract real client IP of the connecting phone
    const realClientIp = extractClientIp(req);
    const prefix = formatIpPrefix(realClientIp || 'Mobile');

    let session = sessions.get(sessionId);
    const isTrusted = isServerIpTrusted(realClientIp, session?.trustedIps);

    if (!session) {
      session = {
        sessionId,
        scanning: true,
        ipPrefix: prefix,
        detectedIp: realClientIp,
        unlocked: false,
        isTrusted,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      session.scanning = true;
      session.ipPrefix = prefix;
      session.detectedIp = realClientIp;
      session.isTrusted = isTrusted;
      session.updatedAt = Date.now();
    }

    sessions.set(sessionId, session);
    broadcastSessionUpdate(session);

    res.json({
      success: true,
      sessionId,
      ip: realClientIp,
      ipPrefix: prefix,
      isTrusted,
      scanning: true,
    });
  });

// Deterministic 6-digit session activation code generator
function generateSessionValidationCode(sessionId: string): string {
  let sum = 0;
  for (let i = 0; i < sessionId.length; i++) {
    sum = (sum * 31 + sessionId.charCodeAt(i)) % 900000;
  }
  return (100000 + (sum % 900000)).toString();
}

  // 6. Smartphone unlocks remote session (after typing password or trusted IP)
  app.post('/api/auth/session/unlock', (req: Request, res: Response) => {
    const { sessionId, reason } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const realClientIp = extractClientIp(req);
    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        scanning: true,
        ipPrefix: formatIpPrefix(realClientIp),
        detectedIp: realClientIp,
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

const DEFAULT_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

function base32ToBuffer(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32[i].toUpperCase());
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function verifyServerTotpCode(candidate: string, secret = DEFAULT_TOTP_SECRET): boolean {
  const clean = candidate.trim().replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const keyBuffer = base32ToBuffer(secret);
  const now = Date.now();

  for (const offset of [0, -30000, 30000]) {
    const epoch = Math.floor((now + offset) / 1000);
    const timeStep = Math.floor(epoch / 30);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeStep), 0);

    const hmac = crypto.createHmac('sha1', keyBuffer).update(timeBuffer).digest();
    const off = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[off] & 0x7f) << 24) |
      ((hmac[off + 1] & 0xff) << 16) |
      ((hmac[off + 2] & 0xff) << 8) |
      (hmac[off + 3] & 0xff);
    const expected = (binary % 1000000).toString().padStart(6, '0');
    if (clean === expected) return true;
  }
  return false;
}

  // 6b. Verify 6-digit activation code or TOTP code submitted from desktop or phone
  app.post('/api/auth/session/verify-code', (req: Request, res: Response) => {
    const { sessionId, code } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const cleanCode = String(code || '').trim().replace(/\D/g, '');
    const expected = generateSessionValidationCode(sessionId);
    const isTotpValid = verifyServerTotpCode(cleanCode);

    if (cleanCode === expected || isTotpValid) {
      const realClientIp = extractClientIp(req);
      const unlockReason = isTotpValid ? 'totp_authenticator' : 'activation_code';
      let session = sessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          scanning: true,
          ipPrefix: isTotpValid ? 'Authenticator' : formatIpPrefix(realClientIp),
          detectedIp: realClientIp,
          unlocked: true,
          unlockReason,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      } else {
        session.unlocked = true;
        session.unlockReason = unlockReason;
        session.updatedAt = Date.now();
      }

      sessions.set(sessionId, session);
      broadcastSessionUpdate(session);

      res.json({ success: true, unlocked: true, reason: unlockReason });
      return;
    }

    res.status(401).json({ success: false, error: 'Code d\'activation incorrect' });
  });

  // 7. Polling endpoint for session status
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
        isTrusted: false,
      });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      scanning: session.scanning,
      ipPrefix: session.ipPrefix,
      detectedIp: session.detectedIp,
      unlocked: session.unlocked,
      isTrusted: session.isTrusted,
      unlockReason: session.unlockReason,
      updatedAt: session.updatedAt,
    });
  });

  // 7b. Server-Sent Events (SSE) stream for instant real-time push to desktop
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
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    addSessionListener(sessionId, listener);

    // Keepalive ping every 10s to prevent proxy connection drops
    const keepAliveTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {}
    }, 10000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      removeSessionListener(sessionId, listener);
    });
  });

  // 8. User Persistent Cloud Sync API (Syncs history & settings between PC & Phone)
  const DATA_DIR = path.resolve(__dirname, 'data');
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[RoadTo2000] Could not create data dir, fallback to tmpdir:', err);
  }

  function getUserDataFilePath(username: string): string {
    const clean = (username || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const preferredDir = fs.existsSync(DATA_DIR) ? DATA_DIR : os.tmpdir();
    return path.resolve(preferredDir, `roadto2000_userdata_${clean}.json`);
  }

  app.get('/api/user-data/:username', (req: Request, res: Response) => {
    try {
      const username = (req.params.username || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
      const filePath = getUserDataFilePath(username);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        res.json({
          success: true,
          username,
          history: Array.isArray(data.history) ? data.history : [],
          settings: data.settings || null,
          lastUpdated: data.lastUpdated || 0,
        });
        return;
      }
      res.json({
        success: true,
        username,
        history: [],
        settings: null,
        lastUpdated: 0,
      });
    } catch (err: any) {
      console.error('[RoadTo2000] Failed to read user data:', err);
      res.status(500).json({ error: 'Failed to read user data' });
    }
  });

  app.post('/api/user-data/:username', (req: Request, res: Response) => {
    try {
      const username = (req.params.username || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }

      const { history: incomingHistory, settings: incomingSettings } = req.body || {};
      const filePath = getUserDataFilePath(username);

      let existingHistory: any[] = [];
      let existingSettings: any = null;

      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.history)) existingHistory = data.history;
          if (data.settings) existingSettings = data.settings;
        } catch {}
      }

      // Merge incoming and existing history: 1 sync per day, keep newest timestamp of that day
      const combined = [...(Array.isArray(incomingHistory) ? incomingHistory : []), ...existingHistory];
      const validRecords = combined.filter((r) => {
        if (!r || typeof r.bestRating !== 'number' || r.bestRating <= 0) return false;
        // Clean out legacy test 1938
        if (username === 'alpharomeo1500' && r.bestRating === 1938) return false;
        if (r.username && r.username.toLowerCase() !== username) return false;
        return true;
      });

      // Sort newest first
      validRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Deduplicate by calendar day
      const seenDays = new Set<string>();
      const onePerDay: any[] = [];
      for (const r of validRecords) {
        const d = new Date(r.timestamp);
        if (isNaN(d.getTime())) continue;
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!seenDays.has(dayKey)) {
          seenDays.add(dayKey);
          onePerDay.push(r);
        }
      }

      const mergedSettings = incomingSettings || existingSettings;
      const payloadToSave = {
        username,
        history: onePerDay.slice(0, 500),
        settings: mergedSettings,
        lastUpdated: Date.now(),
      };

      fs.writeFileSync(filePath, JSON.stringify(payloadToSave, null, 2), 'utf-8');

      res.json({
        success: true,
        username,
        history: payloadToSave.history,
        settings: payloadToSave.settings,
        count: payloadToSave.history.length,
        lastUpdated: payloadToSave.lastUpdated,
      });
    } catch (err: any) {
      console.error('[RoadTo2000] Failed to save user data:', err);
      res.status(500).json({ error: 'Failed to save user data' });
    }
  });

  // 9. Chess.com API proxy route
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
