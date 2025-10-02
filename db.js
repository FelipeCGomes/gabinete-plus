import mysql from 'mysql2/promise';
import pg from 'pg';

let pool = null;
let dbType = 'mysql';

export function initDB(cfg) {
    dbType = (cfg?.type || 'mysql').toLowerCase();
    if (pool) return pool;

    if (dbType.startsWith('post')) {
        pool = new pg.Pool({
            host: cfg.host, port: +(cfg.port || 5432),
            user: cfg.user, password: cfg.password, database: cfg.database,
            ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
            max: 10, idleTimeoutMillis: 30000
        });
        pool.on('error', err => console.error('PG Pool error', err));
        pool.query('select 1').catch(console.error);
    } else {
        pool = mysql.createPool({
            host: cfg.host, port: +(cfg.port || 3306),
            user: cfg.user, password: cfg.password, database: cfg.database,
            ssl: cfg.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
            waitForConnections: true, connectionLimit: 10
        });
        pool.query('select 1').catch(console.error);
    }
    return pool;
}

export async function query(sql, params = []) {
    if (!pool) throw new Error('DB not initialized');
    if (dbType.startsWith('post')) {
        let idx = 0;
        const text = sql.replace(/\?/g, () => '$' + (++idx));
        const res = await pool.query(text, params);
        return [res.rows, null];
    } else {
        return pool.query(sql, params);
    }
}

export const isPg = () => dbType.startsWith('post');
export const isMy = () => !isPg();
export const now = () => Date.now();
