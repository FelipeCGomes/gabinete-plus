// server.js (ESM)
// Executa servidor, serve arquivos estáticos e expõe rotas de bootstrap seguras.
// Observação: esta versão NÃO consulta DB na rota /api/bootstrap/status.
// Assim, mesmo se o DB não estiver pronto, o status funciona e evita 502.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import fs from 'fs';

import {
    initDB,
    ensureSchema,
    createAdminMasterIfMissing,
    testConnection
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(cookieParser());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ----------------------
// Estado de bootstrap (em memória)
// ----------------------
const bootstrapState = {
    inProgress: false,
    ok: false,
    stage: 'idle',     // idle | connecting | creating_schema | creating_admin | done | error
    message: 'Aguardando inicialização',
    error: null,
    lastTriedAt: null,
};

// Expor sempre a rota de status (não faz query no DB)
app.get('/api/bootstrap/status', (_req, res) => {
    res.json({
        ok: bootstrapState.ok,
        inProgress: bootstrapState.inProgress,
        stage: bootstrapState.stage,
        message: bootstrapState.message,
        error: bootstrapState.error,
        lastTriedAt: bootstrapState.lastTriedAt,
    });
});

// Acionador manual do bootstrap
app.post('/api/bootstrap/retry', async (_req, res) => {
    try {
        await runBootstrap();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});

// Healthcheck simples (Render usa em cold start)
app.get('/health', (_req, res) => res.status(200).send('OK'));

// Servir estáticos
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

// ====== A PARTIR DAQUI, PROTEJA SUAS ROTAS /api QUE PRECISAM DO DB ======
// Exemplo de guarda global: bloqueia chamadas que precisem de DB
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/bootstrap')) return next(); // já tratado acima
    if (!bootstrapState.ok) {
        return res.status(503).json({
            error: 'bootstrap_not_ready',
            state: bootstrapState,
        });
    }
    next();
});

// (coloque aqui suas outras rotas /api que usam DB, se houver)

// Rota fallback para abrir login.html diretamente em GET /
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ----------------------
// Bootstrap automático no start
// ----------------------
async function runBootstrap() {
    if (bootstrapState.inProgress) return;
    bootstrapState.inProgress = true;
    bootstrapState.lastTriedAt = new Date().toISOString();
    bootstrapState.error = null;

    try {
        // 1) Testar conexão
        bootstrapState.stage = 'connecting';
        bootstrapState.message = 'Conectando ao banco...';
        await initDB();           // lê ENV ou config interna
        await testConnection();   // SELECT 1

        // 2) Criar esquema (se faltar)
        bootstrapState.stage = 'creating_schema';
        bootstrapState.message = 'Criando/validando tabelas...';
        await ensureSchema();

        // 3) Criar Admin Master se não existir
        bootstrapState.stage = 'creating_admin';
        bootstrapState.message = 'Criando Admin Master (se necessário)...';
        await createAdminMasterIfMissing({
            phone: process.env.ADMIN_MASTER_PHONE || '61999999999',
            password: process.env.ADMIN_MASTER_PASSWORD || 'Senha@Forte1!',
            cpf: process.env.ADMIN_MASTER_CPF || '12345678909',
            name: process.env.ADMIN_MASTER_NAME || 'Admin Master',
        });

        // 4) Finalizado
        bootstrapState.stage = 'done';
        bootstrapState.message = 'Pronto!';
        bootstrapState.ok = true;
    } catch (err) {
        bootstrapState.stage = 'error';
        bootstrapState.message = 'Falha na inicialização';
        bootstrapState.error = String(err?.message || err);
        bootstrapState.ok = false;
    } finally {
        bootstrapState.inProgress = false;
    }
}

// dispara ao subir
runBootstrap().catch(() => { /* já capturado dentro */ });

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Gabinete+ on ${PORT}`);
});
