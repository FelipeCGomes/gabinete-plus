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
import { initDB, query, now, isPg, isDBReady } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const http = app.listen(process.env.PORT || 8080, () => console.log('Gabinete+ on', http.address().port));
const io = new IOServer(http, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// estáticos
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, cacheControl: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { etag: false, cacheControl: false }));

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const CONFIG_PATH = path.join(__dirname, 'config.json');

// -------- config helpers --------
function readConfig() {
    const defaults = {
        db: {
            type: process.env.POSTGRES_HOST || process.env.POSTGRES_DATABASE || process.env.POSTGRES_USER ? 'postgres' : 'mysql',
            host: process.env.POSTGRES_HOST || process.env.MYSQL_HOST,
            port: +(process.env.POSTGRES_PORT || process.env.MYSQL_PORT || 0),
            user: process.env.POSTGRES_USER || process.env.MYSQL_USER,
            password: process.env.POSTGRES_PASSWORD || process.env.MYSQL_PASSWORD,
            database: process.env.POSTGRES_DATABASE || process.env.MYSQL_DATABASE,
            ssl: !!(+process.env.POSTGRES_SSL || +process.env.MYSQL_SSL || 0)
        },
        vapid: {
            publicKey: process.env.VAPID_PUBLIC_KEY || '',
            privateKey: process.env.VAPID_PRIVATE_KEY || '',
            subject: process.env.VAPID_SUBJECT || 'mailto:you@example.com'
        }
    };
    try {
        if (!fs.existsSync(CONFIG_PATH)) return defaults;
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        if (!raw.trim()) return defaults;
        return { ...defaults, ...JSON.parse(raw) };
    } catch (e) {
        console.warn('config.json inválido, usando defaults:', e.message);
        return defaults;
    }
}
function writeConfig(c) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); }
const CONFIG = readConfig();

// inicializa DB automaticamente se houver credenciais (ENV ou config.json)
if (CONFIG.db?.host && CONFIG.db?.user && CONFIG.db?.database) {
    try { initDB(CONFIG.db); } catch (e) { console.error('Falha initDB', e.message); }
}

// web push
function initWebPush() {
    if (CONFIG.vapid?.publicKey && CONFIG.vapid?.privateKey) {
        webpush.setVapidDetails(CONFIG.vapid.subject, CONFIG.vapid.publicKey, CONFIG.vapid.privateKey);
    }
}
initWebPush();

// -------- misc helpers --------
function auth(req, res, next) {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!t) return res.status(401).json({ error: 'no_token' });
    try { req.user = jwt.verify(t, JWT_SECRET); next(); }
    catch (e) { return res.status(401).json({ error: 'bad_token' }); }
}

// guarda para rotas que EXIGEM DB
function ensureDB(req, res, next) {
    if (!isDBReady()) return res.status(503).json({ error: 'setup_required' });
    next();
}

const BADWORDS = ['palavrao1', 'palavrao2', 'idiota', 'burro'];
function hasOffense(text = '') {
    const txt = (text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return BADWORDS.some(w => txt.includes(w));
}
const isPhone = s => /^\+?\d{10,14}$/.test(String(s).replace(/\D/g, ''));
const isCep = s => /^\d{5}-?\d{3}$/.test(s || '');
function isCPF(s) {
    s = String(s || '').replace(/[^\d]/g, ''); if (!/^\d{11}$/.test(s)) return false;
    if (/^(\d)\1+$/.test(s)) return false;
    let sum = 0; for (let i = 0; i < 9; i++) sum += parseInt(s[i]) * (10 - i);
    let rev = 11 - (sum % 11); if (rev >= 10) rev = 0; if (rev != parseInt(s[9])) return false;
    sum = 0; for (let i = 0; i < 10; i++) sum += parseInt(s[i]) * (11 - i);
    rev = 11 - (sum % 11); if (rev >= 10) rev = 0; return rev == parseInt(s[10]);
}
const isAdmin = role => role === 'admin_master' || role === 'administrador';
const isModerator = role => role === 'moderador';

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

// -------- redirects --------
app.get('/', (req, res) => res.redirect('/home.html'));

// -------- setup --------
app.post('/api/setup', upload.fields([{ name: 'candidate_photo' }, { name: 'login_bg' }]), async (req, res) => {
    try {
        const { db_type, host, port, user, password, database, ssl,
            site_name, brand_primary, brand_secondary, brand_accent,
            heat_low, heat_mid, heat_high,
            login_bg_type, login_bg_blur, login_bg_brightness, about_text } = req.body;

        const cFile = req.files?.candidate_photo?.[0];
        const bgFile = req.files?.login_bg?.[0];

        const cfg = {
            db: { type: db_type, host, port: +(port || (db_type?.startsWith('post') ? 5432 : 3306)), user, password, database, ssl: !!(ssl === 'on' || ssl === 'true' || ssl === '1') },
            vapid: readConfig().vapid
        };
        writeConfig(cfg);
        initDB(cfg.db);

        const script = db_type?.startsWith('post') ?
            fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf-8') :
            fs.readFileSync(path.join(__dirname, 'schema.mysql.sql'), 'utf-8');

        for (const stmt of script.split(/;[\r\n]+/).map(s => s.trim()).filter(Boolean)) {
            await query(stmt);
        }

        const candidate_photo = cFile ? '/uploads/' + cFile.filename : null;
        const login_bg_url = bgFile ? '/uploads/' + bgFile.filename : null;

        if (isPg()) {
            await query(`INSERT INTO settings(id,site_name,brand_primary,brand_secondary,brand_accent,heat_low,heat_mid,heat_high,login_candidate_photo,login_bg_url,login_bg_type,login_bg_blur,login_bg_brightness,about_text)
                   VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                   ON CONFLICT (id) DO UPDATE SET site_name=$1,brand_primary=$2,brand_secondary=$3,brand_accent=$4,heat_low=$5,heat_mid=$6,heat_high=$7,
                     login_candidate_photo=COALESCE($8,settings.login_candidate_photo),
                     login_bg_url=COALESCE($9,settings.login_bg_url),
                     login_bg_type=$10,login_bg_blur=$11,login_bg_brightness=$12,about_text=$13`,
                [site_name, brand_primary, brand_secondary, brand_accent, heat_low, heat_mid, heat_high, candidate_photo, login_bg_url, login_bg_type, +(login_bg_blur || 0), +(login_bg_brightness || 100), about_text]);
        } else {
            await query(`INSERT INTO settings(id,site_name,brand_primary,brand_secondary,brand_accent,heat_low,heat_mid,heat_high,login_candidate_photo,login_bg_url,login_bg_type,login_bg_blur,login_bg_brightness,about_text)
                   VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE site_name=VALUES(site_name),brand_primary=VALUES(brand_primary),brand_secondary=VALUES(brand_secondary),brand_accent=VALUES(brand_accent),
                     heat_low=VALUES(heat_low),heat_mid=VALUES(heat_mid),heat_high=VALUES(heat_high),
                     login_candidate_photo=COALESCE(VALUES(login_candidate_photo),login_candidate_photo),
                     login_bg_url=COALESCE(VALUES(login_bg_url),login_bg_url),
                     login_bg_type=VALUES(login_bg_type),login_bg_blur=VALUES(login_bg_blur),login_bg_brightness=VALUES(login_bg_brightness),about_text=VALUES(about_text)`,
                [site_name, brand_primary, brand_secondary, brand_accent, heat_low, heat_mid, heat_high, candidate_photo, login_bg_url, login_bg_type, +(login_bg_blur || 0), +(login_bg_brightness || 100), about_text]);
        }
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'setup_failed' }); }
});

app.post('/api/setup/admin-master', ensureDB, async (req, res) => {
    const { phone, cpf, password } = req.body || {};
    if (!isPhone(phone) || !isCPF(cpf) || !password) return res.status(400).json({ error: 'invalid' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await query(`INSERT INTO users(phone,cpf,password_hash,first_name,last_name,role_key,status,created_at) VALUES(?,?,?,?,?,'admin_master','active',?)`,
        [String(phone).replace(/\D/g, ''), cpf, hash, 'Admin', 'Master', now()]);
    res.json({ ok: true, id: r?.insertId || r?.[0]?.id || null });
});

// -------- settings & push --------
// *** HANDLER À PROVA DE QUEDA ***
app.get('/api/settings', async (req, res) => {
    try {
        // Se DB estiver pronto, tenta ler do banco
        if (isDBReady()) {
            const [rows] = await query(`SELECT * FROM settings WHERE id=1`);
            return res.json(rows[0] || {});
        }
        // DB ainda não configurado: devolve defaults seguros
        return res.json({
            site_name: 'Gabinete+',
            brand_primary: '#0b2240',
            brand_secondary: '#1e3a8a',
            brand_accent: '#b7c9d3',
            heat_low: '#dc3545',
            heat_mid: '#fd7e14',
            heat_high: '#0d6efd'
        });
    } catch (e) {
        // Nunca deixe esse endpoint derrubar a app
        return res.json({});
    }
});

app.post('/api/settings', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id);
    if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const s = req.body || {};
    const sql = isPg()
        ? `UPDATE settings SET site_name=$1,brand_primary=$2,brand_secondary=$3,brand_accent=$4,heat_low=$5,heat_mid=$6,heat_high=$7,login_candidate_photo=COALESCE($8,login_candidate_photo),about_text=$9 WHERE id=1`
        : `UPDATE settings SET site_name=?, brand_primary=?, brand_secondary=?, brand_accent=?, heat_low=?, heat_mid=?, heat_high=?, login_candidate_photo=COALESCE(?,login_candidate_photo), about_text=? WHERE id=1`;
    await query(sql, [s.site_name, s.brand_primary, s.brand_secondary, s.brand_accent, s.heat_low, s.heat_mid, s.heat_high, s.candidate_photo, s.about_text]);
    res.json({ ok: true });
});

// push subscribe (opcional)
app.post('/api/push/subscribe', auth, ensureDB, async (req, res) => {
    const sub = JSON.stringify(req.body || {});
    await query(`INSERT INTO push_subs(user_id,sub_json,created_at) VALUES(?,?,?)`, [req.user.id, sub, now()]);
    res.json({ ok: true });
});
app.post('/api/push/test', auth, (req, res) => res.json({ ok: true }));

// -------- auth --------
app.post('/api/login', ensureDB, async (req, res) => {
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

app.get('/api/me', auth, ensureDB, async (req, res) => res.json({ user: await getMe(req.user.id) }));

app.post('/api/presence', auth, ensureDB, async (req, res) => {
    await query(`INSERT INTO presence(user_id,last_seen) VALUES(?,?) ${isPg() ? 'ON CONFLICT (user_id) DO UPDATE SET last_seen=EXCLUDED.last_seen' : 'ON DUPLICATE KEY UPDATE last_seen=VALUES(last_seen)'}`, [req.user.id, now()]);
    io.emit('presence:update', { user_id: req.user.id, online: true });
    res.json({ ok: true });
});

// -------- RA --------
app.get('/api/ra', async (req, res) => {
    if (!isDBReady()) return res.json([]); // antes do setup, devolve vazio
    const [r] = await query(`SELECT * FROM ra ORDER BY name`);
    res.json(r);
});
app.post('/api/ra', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    await query(`INSERT INTO ra(name) VALUES(?)`, [req.body.name]); res.json({ ok: true });
});
app.delete('/api/ra/:id', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    await query(`DELETE FROM ra WHERE id=?`, [req.params.id]); res.json({ ok: true });
});

// -------- perfil --------
app.put('/api/users/me', auth, ensureDB, async (req, res) => {
    const u = req.body || {};
    if (u.phone && !isPhone(u.phone)) return res.status(400).json({ error: 'invalid_phone' });
    if (u.cpf && !isCPF(u.cpf)) return res.status(400).json({ error: 'invalid_cpf' });
    if (u.cep && !isCep(u.cep)) return res.status(400).json({ error: 'invalid_cep' });
    await query(`UPDATE users SET first_name=?, last_name=?, address=?, cep=?, city=?, ra_id=?, avatar_url=COALESCE(?,avatar_url) WHERE id=?`,
        [u.first_name, u.last_name, u.address, u.cep, u.city, u.ra_id || null, u.avatar_url, req.user.id]);
    res.json({ ok: true });
});

// -------- banners --------
app.get('/api/banners', async (req, res) => {
    if (!isDBReady()) return res.json([]);
    const [r] = await query(`SELECT * FROM banners WHERE active=1 ORDER BY created_at DESC LIMIT 50`); res.json(r);
});
app.get('/api/admin/banners', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key) && !isModerator(me.role_key)) return res.status(403).json({ error: 'forbidden' }); const [r] = await query(`SELECT * FROM banners ORDER BY created_at DESC`); res.json(r);
});
app.post('/api/admin/banners', auth, ensureDB, upload.single('image'), async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key) && !isModerator(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    if (!req.file) return res.status(400).json({ error: 'image_required' });
    const url = '/uploads/' + req.file.filename; const { title, link_url } = req.body;
    const [r] = await query(`INSERT INTO banners(title,image_url,link_url,active,created_at) VALUES(?,?,?,?,?)`, [title || null, url, link_url || null, 1, now()]);
    res.json({ id: r?.insertId || r?.[0]?.id || null, title, image_url: url, link_url, active: 1 });
});
app.put('/api/admin/banners/:id', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key) && !isModerator(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    if (req.body.activeToggle) { await query(`UPDATE banners SET active=${isPg() ? '1-active' : '1-active'} WHERE id=?`, [req.params.id]); return res.json({ ok: true }); }
    await query(`UPDATE banners SET title=COALESCE(?,title), link_url=COALESCE(?,link_url), active=COALESCE(?,active) WHERE id=?`,
        [req.body.title, req.body.link_url, req.body.active, req.params.id]); res.json({ ok: true });
});
app.delete('/api/admin/banners/:id', auth, ensureDB, async (req, res) => { const me = await getMe(req.user.id); if (!isAdmin(me.role_key) && !isModerator(me.role_key)) return res.status(403).json({ error: 'forbidden' }); await query(`DELETE FROM banners WHERE id=?`, [req.params.id]); res.json({ ok: true }); });

// -------- posts / comments / likes / poll --------
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

app.post('/api/posts', auth, ensureDB, upload.single('media'), async (req, res) => {
    const me = await getMe(req.user.id);
    if (me.status !== 'active') return res.status(403).json({ error: 'not_validated' });
    const { type, content, options, event_date, event_place } = req.body || {};
    if (hasOffense(content)) {
        await query(`UPDATE users SET status='blocked' WHERE id=?`, [me.id]);
        await query(`INSERT INTO audit_logs(action,actor_id,target_id,meta_json,created_at) VALUES(?,?,?,?,?)`,
            ['offense_block', me.id, me.id, JSON.stringify({ content }), now()]);
        return res.status(403).json({ error: 'offensive_blocked' });
    }
    let media_url = null; let opts = null;
    if ((type === 'photo' || type === 'video') && req.file) media_url = '/uploads/' + req.file.filename;
    if (type === 'poll' && options) {
        opts = options.split(';').map(t => ({ id: uuidv4(), text: t.trim(), votes: 0 })).filter(x => x.text);
    }
    const [r] = await query(`INSERT INTO posts(author_id,type,content,media_url,options_json,event_date,event_place,created_at)
                         VALUES(?,?,?,?,?,?,?,?)`,
        [me.id, type, content || null, media_url, opts ? JSON.stringify(opts) : null, event_date || null, event_place || null, now()]);
    const id = r?.insertId || r?.[0]?.id || null;
    const post = { id, type, content, media_url, options: opts || [], event_date, event_place, likes: 0, created_at: now(), first_name: me.first_name, last_name: me.last_name, avatar_url: me.avatar_url, author_id: me.id };
    io.emit('post:new', post);
    res.json(post);
});

app.post('/api/posts/:id/like', auth, ensureDB, async (req, res) => {
    const pid = +req.params.id;
    const [[likedRow]] = await query(`SELECT 1 FROM post_likes WHERE post_id=? AND user_id=?`, [pid, req.user.id]);
    if (!likedRow) {
        await query(`INSERT INTO post_likes(post_id,user_id) VALUES(?,?)`, [pid, req.user.id]);
        await query(`UPDATE posts SET likes=likes+1 WHERE id=?`, [pid]);
    }
    const [[p]] = await query(`SELECT likes FROM posts WHERE id=?`, [pid]);
    io.emit('post:like', { post_id: pid, likes: p.likes });
    res.json({ likes: p.likes });
});

app.post('/api/posts/:id/vote', auth, ensureDB, async (req, res) => {
    const pid = +req.params.id;
    const { option_id } = req.body || {};
    const [[exists]] = await query(`SELECT 1 FROM poll_votes WHERE post_id=? AND user_id=?`, [pid, req.user.id]);
    if (exists) return res.status(400).json({ error: 'already_voted' });
    await query(`INSERT INTO poll_votes(post_id,option_id,user_id) VALUES(?,?,?)`, [pid, option_id, req.user.id]);
    const [[row]] = await query(`SELECT options_json FROM posts WHERE id=?`, [pid]);
    let opts = row?.options_json ? JSON.parse(row.options_json) : [];
    const idx = opts.findIndex(o => o.id === option_id);
    if (idx >= 0) { opts[idx].votes = (opts[idx].votes || 0) + 1; await query(`UPDATE posts SET options_json=? WHERE id=?`, [JSON.stringify(opts), pid]); }
    res.json({ ok: true, options: opts });
});

app.post('/api/posts/:id/comment', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id);
    const { text } = req.body || {};
    if (hasOffense(text)) {
        await query(`UPDATE users SET status='blocked' WHERE id=?`, [me.id]);
        await query(`INSERT INTO audit_logs(action,actor_id,target_id,meta_json,created_at) VALUES(?,?,?,?,?)`,
            ['offense_block', me.id, req.params.id, JSON.stringify({ text }), now()]);
        return res.status(403).json({ error: 'offensive_blocked' });
    }
    await query(`INSERT INTO comments(post_id,author_id,text,created_at) VALUES(?,?,?,?)`, [req.params.id, me.id, text, now()]);
    res.json({ ok: true });
});

// -------- hierarchy / ranking --------
app.get('/api/hierarchy/me', auth, ensureDB, async (req, res) => {
    const [[me]] = await query(`SELECT id,first_name,last_name,avatar_url FROM users WHERE id=?`, [req.user.id]);
    const [level1] = await query(`SELECT id,first_name,last_name,avatar_url FROM users WHERE inviter_id=? ORDER BY id DESC`, [req.user.id]);
    const ids = level1.map(x => x.id);
    const [level2] = ids.length ? await query(`SELECT id,first_name,last_name,avatar_url,inviter_id FROM users WHERE inviter_id IN (${ids.map(() => '?').join(',')})`, ids) : [[]];
    res.json({ me, level1, level2 });
});

app.get('/api/admin/ranking', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const from = parseInt(req.query.from || 0, 10) || 0;
    const to = parseInt(req.query.to || 0, 10) || now();
    const [rows] = await query(`SELECT inviter_id, COUNT(*) as total FROM users WHERE inviter_id IS NOT NULL AND created_at BETWEEN ? AND ? GROUP BY inviter_id ORDER BY total DESC LIMIT 50`, [from, to]);
    if (!rows.length) return res.json([]);
    const ids = rows.map(r => r.inviter_id);
    const [names] = await query(`SELECT id,first_name,last_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    const map = Object.fromEntries(names.map(n => [n.id, n]));
    res.json(rows.map(r => ({ user_id: r.inviter_id, total: r.total, first_name: map[r.inviter_id]?.first_name, last_name: map[r.inviter_id]?.last_name })));
});

// -------- admin: users / metas / export-import --------
app.get('/api/admin/users', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const [rows] = await query(`SELECT u.*, r.name as ra_name,
     (SELECT COUNT(*) FROM users x WHERE x.inviter_id=u.id AND x.status='active') as referrals_valid,
     (SELECT COUNT(*) FROM users x WHERE x.inviter_id=u.id AND x.status IN ('pending','inactive','invalid')) as referrals_pending
     FROM users u LEFT JOIN ra r ON r.id=u.ra_id ORDER BY u.created_at DESC LIMIT 1000`);
    res.json(rows.map(u => ({
        id: u.id, first_name: u.first_name, last_name: u.last_name, phone: u.phone,
        role_key: u.role_key, status: u.status, ra_name: u.ra_name,
        goal_enabled: !!u.goal_enabled, goal_total: u.goal_total || 0,
        referrals_valid: +u.referrals_valid || 0, referrals_pending: +u.referrals_pending || 0
    })));
});
app.post('/api/admin/users/:id/status', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    await query(`UPDATE users SET status=? WHERE id=?`, [req.body.status, req.params.id]); res.json({ ok: true });
});
app.put('/api/admin/users/:id/goal', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    await query(`UPDATE users SET goal_enabled=?, goal_total=? WHERE id=?`, [req.body.enabled ? 1 : 0, req.body.total || 0, req.params.id]); res.json({ ok: true });
});
app.get('/api/admin/users/:id/metrics', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const [[u]] = await query(`SELECT goal_enabled,goal_total FROM users WHERE id=?`, [req.params.id]);
    const [[v]] = await query(`SELECT COUNT(*) as c FROM users WHERE inviter_id=? AND status='active'`, [req.params.id]);
    const [[p]] = await query(`SELECT COUNT(*) as c FROM users WHERE inviter_id=? AND status IN ('pending','inactive','invalid')`, [req.params.id]);
    res.json({ goal_enabled: !!u.goal_enabled, goal_total: u.goal_total || 0, valid: +(v.c || 0), pending: +(p.c || 0) });
});

app.get('/api/admin/users/export.txt', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const [rows] = await query(`SELECT first_name,last_name,phone,role_key,city,ra_id FROM users ORDER BY id`);
    const lines = rows.map(r => `${r.first_name || ''};${r.last_name || ''};${r.phone || ''};;${r.role_key || 'usuario'};${r.city || ''};${r.ra_id || ''}`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
});

app.post('/api/admin/users/import.txt', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const text = String(req.body?.text || '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let ok = 0, fail = 0;
    for (const line of lines) {
        const [first, last, phone, senha, role, city, ra] = line.split(';').map(s => s?.trim());
        try {
            if (!isPhone(phone)) { fail++; continue; }
            const hash = await bcrypt.hash(senha || '123456', 10);
            await query(`INSERT INTO users(first_name,last_name,phone,password_hash,role_key,city,ra_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
                [first || null, last || null, String(phone).replace(/\D/g, ''), hash, role || 'usuario', city || null, ra ? +ra : null, 'pending', now()]);
            ok++;
        } catch { fail++; }
    }
    res.json({ ok, fail });
});

// -------- roles & permissions --------
app.get('/api/admin/roles', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const [rows] = await query(`SELECT * FROM roles ORDER BY immutable DESC, name`);
    res.json(rows);
});
app.post('/api/admin/roles', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const { key_name, name } = req.body || {};
    if (!key_name || !name) return res.status(400).json({ error: 'missing' });
    await query(`INSERT INTO roles(key_name,name,immutable) VALUES(?, ?, 0)`, [key_name, name]);
    res.json({ ok: true });
});
app.delete('/api/admin/roles/:key', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const [[r]] = await query(`SELECT immutable FROM roles WHERE key_name=?`, [req.params.key]);
    if (r?.immutable) return res.status(400).json({ error: 'immutable' });
    await query(`DELETE FROM roles WHERE key_name=?`, [req.params.key]);
    await query(`DELETE FROM permissions WHERE role_key=?`, [req.params.key]);
    res.json({ ok: true });
});
app.get('/api/admin/permissions', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const role = req.query.role; if (!role) return res.status(400).json({ error: 'missing_role' });
    const [rows] = await query(`SELECT * FROM permissions WHERE role_key=?`, [role]);
    res.json(rows);
});
app.put('/api/admin/permissions', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id); if (!isAdmin(me.role_key)) return res.status(403).json({ error: 'forbidden' });
    const { role_key, items } = req.body || {};
    if (!role_key || !Array.isArray(items)) return res.status(400).json({ error: 'bad_payload' });
    await query(`DELETE FROM permissions WHERE role_key=?`, [role_key]);
    for (const it of items) {
        await query(`INSERT INTO permissions(role_key,resource,can_view,can_edit,can_delete) VALUES(?,?,?,?,?)`,
            [role_key, it.resource, it.can_view ? 1 : 0, it.can_edit ? 1 : 0, it.can_delete ? 1 : 0]);
    }
    res.json({ ok: true });
});

// -------- invitations --------
app.post('/api/invitations', auth, ensureDB, async (req, res) => {
    const me = await getMe(req.user.id);
    if (me.status !== 'active') return res.status(403).json({ error: 'not_validated' });
    const { full_name, phone } = req.body || {};
    if (full_name && full_name.length < 3) return res.status(400).json({ error: 'name_short' });
    if (phone && !isPhone(phone)) return res.status(400).json({ error: 'bad_phone' });
    const code = uuidv4().replace(/-/g, '').slice(0, 24);
    await query(`INSERT INTO invitations(code,inviter_id,full_name,phone,created_at) VALUES(?,?,?,?,?)`,
        [code, me.id, full_name || null, phone ? String(phone).replace(/\D/g, '') : null, now()]);
    res.json({ code, link: `${req.protocol}://${req.get('host')}/login.html?invite=${code}` });
});
app.get('/api/invitations/:code', async (req, res) => {
    if (!isDBReady()) return res.status(404).json({ error: 'not_found' });
    const [[inv]] = await query(`SELECT code,full_name,phone,status FROM invitations WHERE code=?`, [req.params.code]);
    if (!inv) return res.status(404).json({ error: 'not_found' });
    res.json(inv);
});
app.post('/api/invitations/:code/complete', async (req, res) => {
    if (!isDBReady()) return res.status(503).json({ error: 'setup_required' });
    const { phone, password, first_name, last_name, cep, city, ra_id } = req.body || {};
    const [[inv]] = await query(`SELECT * FROM invitations WHERE code=? AND status='pending'`, [req.params.code]);
    if (!inv) return res.status(400).json({ error: 'invalid_code' });
    if (!isPhone(phone) || !password) return res.status(400).json({ error: 'bad_payload' });

    const hash = await bcrypt.hash(password, 10);
    const [u] = await query(`INSERT INTO users(phone,password_hash,first_name,last_name,cep,city,ra_id,inviter_id,status,created_at)
                           VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [String(phone).replace(/\D/g, ''), hash, first_name || null, last_name || null, cep || null, city || null, ra_id || null, inv.inviter_id, 'pending', now()]);
    const newId = u?.insertId || u?.[0]?.id || null;
    await query(`UPDATE invitations SET pending_user_id=?, status='completed' WHERE id=?`, [newId, inv.id]);
    res.json({ ok: true });
});

// -------- contato --------
app.post('/api/contact', async (req, res) => {
    if (!isDBReady()) return res.json({ ok: true }); // aceita durante pré-setup (ou troque para 503)
    const { name, phone, email, city, uf, message } = req.body || {};
    if (!name || !message) return res.status(400).json({ error: 'missing' });
    await query(`INSERT INTO contact_messages(name,phone,email,city,uf,message,created_at) VALUES(?,?,?,?,?,?,?)`,
        [name, phone || null, email || null, city || null, (uf || '').toUpperCase().slice(0, 2), message, now()]);
    res.json({ ok: true });
});

// -------- sockets --------
io.on('connection', (socket) => { socket.on('hello', () => { }); });

// -------- health --------
app.get('/health', (req, res) => res.json({ ok: true }));
