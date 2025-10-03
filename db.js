// db.js (ESM)
// Configuração do Postgres via ENV ou bloco fixo (DIRECT_DB_CONFIG).
// Sem "serial"; sem default de UUID (geramos pelo Node). Seguro no Render.

import crypto from 'crypto';

let pg = null;
let pool = null;

//const DIRECT_DB_CONFIG = {};
// Deixe {} para usar ENV no Render. 
// Se quiser fixar manualmente, preencha assim:
const DIRECT_DB_CONFIG = {
  type: 'postgres',
  host: 'dpg-d3g18o1r0fns73dm6p60-a.internal',
  port: 5432,
  user: 'gabinete_plus_user',
  password: 'ibyKDwL2iot9ASwhywoK3YmqssTINmai',
  database: 'gabinete_plus_qz12',
  ssl: true,
};

function readConfig() {
    if (DIRECT_DB_CONFIG && DIRECT_DB_CONFIG.type) {
        return DIRECT_DB_CONFIG;
    }
    // ENV → Render
    const type = process.env.DB_TYPE || (process.env.POSTGRES_HOST ? 'postgres' : null);
    if (type === 'postgres') {
        return {
            type: 'postgres',
            host: process.env.POSTGRES_HOST,
            port: Number(process.env.POSTGRES_PORT || 5432),
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            database: process.env.POSTGRES_DATABASE,
            ssl: !!(process.env.POSTGRES_SSL && process.env.POSTGRES_SSL !== '0'),
        };
    }
    throw new Error('DB config ausente. Defina ENV de Postgres ou DIRECT_DB_CONFIG.');
}

export async function initDB() {
    if (pool) return pool;
    const cfg = readConfig();

    if (cfg.type !== 'postgres') {
        throw new Error('Somente Postgres nessa configuração.');
    }

    if (!pg) {
        // importa sob demanda (resolve problemas de ESM)
        pg = await import('pg');
    }
    const { Pool } = pg;

    pool = new Pool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
        max: 5,
    });

    return pool;
}

export async function testConnection() {
    if (!pool) await initDB();
    await pool.query('SELECT 1');
    return true;
}

export async function ensureSchema() {
    // Cria tabelas mínimas necessárias para login e posts.
    // Sem SERIAL/IDENTITY; chaves serão geradas no app (UUID v4).
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', -- 'master','admin','moderator','user'
      name TEXT,
      cpf TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      active BOOLEAN DEFAULT true
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,             -- photo|video|text|poll|event
      text TEXT,
      media_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      status TEXT DEFAULT 'visible'
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      permissions JSONB DEFAULT '{}'::jsonb
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, group_id)
    );
  `);

    // Grupos padrão
    await pool.query(
        `INSERT INTO groups (id, name, permissions) 
     VALUES ($1, 'Admin Master', '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
        [crypto.randomUUID()]
    );
    await pool.query(
        `INSERT INTO groups (id, name, permissions) 
     VALUES ($1, 'Admin', '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
        [crypto.randomUUID()]
    );
    await pool.query(
        `INSERT INTO groups (id, name, permissions) 
     VALUES ($1, 'Moderator', '{"content": true}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
        [crypto.randomUUID()]
    );
}

export async function createAdminMasterIfMissing({ phone, password, cpf, name }) {
    const bcrypt = (await import('bcryptjs')).default;
    const { rows } = await pool.query(`SELECT id FROM users LIMIT 1`);
    if (rows.length > 0) return; // já tem algum usuário

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
        `INSERT INTO users (id, phone, password_hash, role, name, cpf, active)
     VALUES ($1, $2, $3, 'master', $4, $5, true)
    `,
        [id, phone, hash, name, cpf]
    );
}

export async function query(text, params) {
    if (!pool) throw new Error('DB not initialized');
    return pool.query(text, params);
}
