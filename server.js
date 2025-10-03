import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { Server as IOServer } from 'socket.io';
import webpush from 'web-push';
import { v4 as uuidv4 } from 'uuid';

import {
    startBootstrap, getBootstrapStatus, retryBootstrap,
    isDBReady, isPg, query
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const http = app.listen(process.env.PORT || 8080, () => console.log('Gabinete+ on', http.address().port));
const io = new IOServer(http, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, cacheControl: false }));
app.use('/uploads', express.static(uploadsDir, { etag: false, cacheControl: false }));

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// Push (opcional via ENV; pode deixar vazio)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:you@example.com',
        process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

// === Inicia bootstrap do DB (assíncrono; status exposto em /api/bootstrap) ===
startBootstrap();

// Helpers
function auth(req, res, next) {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!t) return res.status(401).json({ error: 'no_token' });
    try { req.user = jwt.verify(t, JWT_SECRET); next(); }
    catch { return res.status(401).json({ error: 'bad_token' }); }
}
const BADWORDS = ['palavrao1', 'palavrao2', 'idiota', 'burro'];
const hasOffense = (s = '') => BADWORDS.some(w => (s || '').toLowerCase().includes(w));
const isPhone = s => /^\+?\d{10,14}$/.test(String(s || '').replace(/\D/g, ''));
function isCPF(s) {
    s = String(s || '').replace(/[^\d]/g, ''); if (!/^\d{11}$/.test(s)) return false;
    if (/^(\d)\1+$/.test(s)) return false;
    let sum = 0; for (let i = 0; i < 9; i++) sum += parseInt(s[i]) * (10 - i);
    let rev = 11 - (sum % 11); if (rev >= 10) rev = 0; if (rev != parseInt(s[9])) return false;
    sum = 0; for (let i = 0; i < 10; i++) sum += parseInt(s[i]) * (11 - i);
    rev = 11 - (sum % 11); if (rev >= 10) rev = 0; return rev == parseInt(s[10]);
}
const isAdmin = r => r === 'admin_master' || r === 'administrador';

async function getMe(id) {
    const [rows] = await query(`
    SELECT u.*, r.name as ra_name,
           (SELECT CONCAT(i.first_name,' ',i.last_name) FROM users i WHERE i.id=u.inviter_id) as inviter_name
      FROM users u LEFT JOIN ra r ON r.id=u.ra_id WHERE u.id=?`, [id]);
    const u = rows[0];
    if (!u) return null;
    return {
        id: u.id, phone: u.phone, role_key: u.role_key, status: u.status,
        first_name: u.first_name, last_name: u.last_name, address: u.address,
        cep: u.cep, city: u.city, ra_id: u.ra_id, ra_name: u.ra_name,
        inviter_id: u.inviter_id, inviter_name: u.inviter_name, avatar_url: u.avatar_url
    };
}

// ===== Bootstrap status (para o overlay do frontend) =====
app.get('/api/bootstrap/status', (req, res) => res.json(getBootstrapStatus()));
app.post('/api/bootstrap/retry', async (req, res) => res.json(await retryBootstrap()));

// ===== Navegação básica =====
app.get('/', (req, res) => res.redirect('/home.html'));

// ===== Settings mínimos para estilizar login/home mesmo sem DB =====
app.get('/api/settings', async (req, res) => {
    if (!isDBReady()) return res.json({
        site_name: 'Gabinete+',
        brand_primary: '#0b2240',
        brand_secondary: '#1e3a8a',
        brand_accent: '#b7c9d3',
        heat_low: '#dc3545',
        heat_mid: '#fd7e14',
        heat_high: '#0d6efd',
        login_candidate_photo: null,
        login_bg_url: null,
        login_bg_blur: 0,
        login_bg_brightness: 100
    });
    const [rows] = await query(`SELECT * FROM settings WHERE id=1`);
    res.json(rows[0] || {});
});

// ===== Auth =====
app.post('/api/login', async (req, res) => {
    if (!isDBReady()) return res.status(503).json({ error: 'bootstrap_in_progress' });
    const { phone, password } = req.body || {};
    if (!isPhone(phone)) return res.status(400).json({ error: 'invalid_phone' });
    const [rows] = await query(`SELECT * FROM users WHERE phone=?`, [String(phone).replace(/\D/g, '')]);
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'not_found' });
    if (!(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'bad_credentials' });
    if (u.status === 'blocked') return res.status(403).json({ error: 'blocked' });
    const token = jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: await getMe(u.id) });
});
app.get('/api/me', auth, async (req, res) => {
    if (!isDBReady()) return res.status(503).json({ error: 'bootstrap_in_progress' });
    res.json({ user: await getMe(req.user.id) });
});

// ===== RA =====
app.get('/api/ra', async (req, res) => {
    if (!isDBReady()) return res.json([]);
    const [r] = await query(`SELECT * FROM ra ORDER BY name`);
    res.json(r);
});

// ===== Banners =====
app.get('/api/banners', async (req, res) => {
    if (!isDBReady()) return res.json([]);
    const [r] = await query(`SELECT * FROM banners WHERE active=1 ORDER BY created_at DESC LIMIT 50`);
    res.json(r);
});
app.post('/api/admin/banners', auth, async (req, res) => {
    if (!isDBReady()) return res.status(503).json({ error: 'bootstrap_in_progress' });
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    res.status(501).json({ error: 'not_implemented_in_this_snippet' });
});

// ===== Posts (principais rotas usadas no Home) =====
app.get('/api/posts', async (req, res) => {
    if (!isDBReady()) return res.json([]);
    const [rows] = await query(`SELECT p.*, u.first_name,u.last_name,u.avatar_url,u.id as author_id
                             FROM posts p JOIN users u ON u.id=p.author_id
                             ORDER BY p.id DESC LIMIT 100`);
    const mapped = rows.map(r => ({
        id: r.id, type: r.type, content: r.content, media_url: r.media_url,
        options: r.options_json ? JSON.parse(r.options_json) : [],
        event_date: r.event_date, event_place: r.event_place,
        likes: r.likes, created_at: r.created_at,
        first_name: r.first_name, last_name: r.last_name, avatar_url: r.avatar_url, author_id: r.author_id
    }));
    res.json(mapped);
});

app.post('/api/posts', auth, async (req, res) => {
    if (!isDBReady()) return res.status(503).json({ error: 'bootstrap_in_progress' });
    // Para simplificar o snippet, bloqueamos criação de post por multipart aqui.
    // Seu projeto já tem a versão completa — reative conforme seu /public/js/pages/home.js.
    res.status(501).json({ error: 'not_implemented_in_this_snippet' });
});

// ===== Health =====
app.get('/health', (req, res) => res.json({ ok: true }));

// ===== Socket.IO mínimos (presença/likes no seu código completo) =====
io.on('connection', () => { });
