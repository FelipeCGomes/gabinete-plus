// db.js — Gabinete+ v0.7.0
// - Config direto aqui (DIRECT_DB_CONFIG) OU via ENV (tem prioridade se definido).
// - Inicializa pool, testa conexão, aplica schema automaticamente se faltar.
// - Exports status de bootstrap para frontend mostrar progresso e "tentar novamente".

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PG = path.join(__dirname, 'schema.pg.sql');
const SCHEMA_MY = path.join(__dirname, 'schema.mysql.sql');

let pool = null;
let driver = null; // 'pg' | 'mysql'

// ===== CONFIG DIRETA (edite aqui se não usar .env) =====
const DIRECT_DB_CONFIG = {
    // Exemplo Postgres:
    // type: 'postgres',
    // host: 'localhost',
    // port: 5432,
    // user: 'gabinete',
    // password: 'senha',
    // database: 'gabinete_plus',
    // ssl: false,

    // Exemplo MySQL:
    // type: 'mysql',
    // host: 'localhost',
    // port: 3306,
    // user: 'gabinete',
    // password: 'senha',
    // database: 'gabinete_plus',
    // ssl: false,
};

// ===== ADMIN MASTER SEED =====
const SEED_ADMIN = {
    phone: process.env.ADMIN_MASTER_PHONE || '61999999999',
    password: process.env.ADMIN_MASTER_PASSWORD || 'Senha@Forte1!',
    cpf: process.env.ADMIN_MASTER_CPF || '12345678909'
};

// ===== Bootstrap state (para UI) =====
const bootstrap = {
    running: false,
    ready: false,
    steps: [],
    error: null
};
function step(msg) { bootstrap.steps.push({ t: Date.now(), msg }); }

// ===== Utils =====
export function isPg() { return driver === 'pg'; }
export function isDBReady() { return !!pool; }

// Aplica "?" -> $1,$2,... para Postgres
function toPg(sql, params) {
    if (!params || !params.length) return { sql, params };
    let i = 0; const s = sql.replace(/\?/g, () => '$' + (++i));
    return { sql: s, params };
}

// Resolve config a partir do ENV ou do bloco DIRECT_DB_CONFIG
function resolveConfig() {
    // ENV Postgres
    if (process.env.POSTGRES_HOST || process.env.POSTGRES_DATABASE || process.env.POSTGRES_USER) {
        return {
            type: 'postgres',
            host: process.env.POSTGRES_HOST,
            port: +(process.env.POSTGRES_PORT || 5432),
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            database: process.env.POSTGRES_DATABASE,
            ssl: !!(+process.env.POSTGRES_SSL || 0),
        };
    }
    // ENV MySQL
    if (process.env.MYSQL_HOST || process.env.MYSQL_DATABASE || process.env.MYSQL_USER) {
        return {
            type: 'mysql',
            host: process.env.MYSQL_HOST,
            port: +(process.env.MYSQL_PORT || 3306),
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            ssl: !!(+process.env.MYSQL_SSL || 0),
        };
    }
    // Direto no arquivo
    if (DIRECT_DB_CONFIG && DIRECT_DB_CONFIG.host && DIRECT_DB_CONFIG.user && DIRECT_DB_CONFIG.database) {
        return { ...DIRECT_DB_CONFIG };
    }
    return null;
}

// Inicializa pool a partir da cfg
function initDB(cfg) {
    driver = (cfg.type || '').toLowerCase().startsWith('post') ? 'pg' : 'mysql';
    if (driver === 'pg') {
        pool = new PgPool({
            host: cfg.host, port: +(cfg.port || 5432), user: cfg.user, password: cfg.password, database: cfg.database,
            ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined
        });
    } else {
        pool = mysql.createPool({
            host: cfg.host, port: +(cfg.port || 3306), user: cfg.user, password: cfg.password, database: cfg.database,
            waitForConnections: true, connectionLimit: 10, queueLimit: 0,
            ssl: cfg.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined
        });
    }
}

// Query normalizada
export async function query(sql, params = []) {
    if (!pool) throw new Error('DB not initialized');
    if (driver === 'pg') {
        const { sql: s, params: p } = toPg(sql, params);
        const r = await pool.query(s, p);
        return [r.rows, r];
    } else {
        const [rows, meta] = await pool.query(sql, params);
        return [rows, meta];
    }
}

// Testa conexão rápida
async function testConnection() {
    if (driver === 'pg') { await pool.query('select 1'); }
    else { await pool.query('select 1'); }
}

// Verifica se tabela "users" existe
async function usersTableExists() {
    if (driver === 'pg') {
        const [rows] = await query(`SELECT 1 FROM information_schema.tables WHERE table_name='users' LIMIT 1`);
        return rows.length > 0;
    } else {
        const [rows] = await query(`SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users' LIMIT 1`);
        return rows.length > 0;
    }
}

// Executa schema do arquivo (idempotente)
async function applySchema() {
    const file = (driver === 'pg') ? SCHEMA_PG : SCHEMA_MY;
    const sql = fs.readFileSync(file, 'utf-8');
    const chunks = sql.split(/;[\r\n]+/).map(s => s.trim()).filter(Boolean);
    let i = 0;
    for (const stmt of chunks) {
        i++; step(`Aplicando schema (${i}/${chunks.length})...`);
        await query(stmt);
    }
}

// Cria Admin Master se não existir ninguém
async function ensureAdminMaster() {
    const [[rowCount]] = await query(`SELECT COUNT(*) as c FROM users`);
    const c = rowCount.c || rowCount.C || rowCount.count || 0;
    if (c > 0) return;
    step('Criando usuário Admin Master padrão...');
    const phone = String(SEED_ADMIN.phone).replace(/\D/g, '');
    const hash = await bcrypt.hash(SEED_ADMIN.password, 10);
    await query(`INSERT INTO users(phone, cpf, password_hash, first_name, last_name, role_key, status, created_at)
               VALUES(?,?,?,?,?,'admin_master','active',?)`,
        [phone, SEED_ADMIN.cpf, hash, 'Admin', 'Master', Date.now()]);
}

// ---- Bootstrap principal (chamado no server.js) ----
export async function startBootstrap() {
    if (bootstrap.running) return;
    bootstrap.running = true; bootstrap.ready = false; bootstrap.error = null; bootstrap.steps.length = 0;

    try {
        step('Resolvendo configuração do banco...');
        const cfg = resolveConfig();
        if (!cfg) throw new Error('Configuração de banco não encontrada. Defina ENV ou edite DIRECT_DB_CONFIG em db.js.');

        step(`Iniciando pool (${cfg.type})...`);
        initDB(cfg);

        step('Testando conexão...');
        await testConnection();

        const exists = await usersTableExists();
        if (!exists) {
            step('Tabelas ausentes. Aplicando schema...');
            await applySchema();
        } else {
            step('Tabelas existentes detectadas.');
        }

        await ensureAdminMaster();

        bootstrap.ready = true; bootstrap.running = false;
        step('Pronto! Banco inicializado.');
    } catch (e) {
        bootstrap.error = e.message || String(e);
        bootstrap.running = false; bootstrap.ready = false;
        step('Falhou: ' + bootstrap.error);
    }
}

export function getBootstrapStatus() {
    return {
        running: bootstrap.running,
        ready: bootstrap.ready,
        error: bootstrap.error,
        steps: [...bootstrap.steps]
    };
}

export async function retryBootstrap() {
    if (bootstrap.running) return getBootstrapStatus();
    // encerra pool antigo (se houver)
    try { if (pool && driver === 'pg') await pool.end(); } catch { }
    try { if (pool && driver === 'mysql') await pool.end(); } catch { }
    pool = null; driver = null;
    await startBootstrap();
    return getBootstrapStatus();
}
