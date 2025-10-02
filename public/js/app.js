// Core do front: auth, fetch wrapper, navbar, SW, Socket.io, presença, push

const GP = {
    token: localStorage.getItem('gp_token') || null,
    user: null,
    settings: null,
    socket: null,
    presence: new Map(), // user_id -> last_seen
};

function setActiveNav(path) {
    document.querySelectorAll('.navbar nav a').forEach(a => {
        if (a.getAttribute('href') === path) a.classList.add('active'); else a.classList.remove('active');
    });
}

async function api(path, { method = 'GET', body, form = false } = {}) {
    const headers = {};
    if (!form) headers['Content-Type'] = 'application/json';
    if (GP.token) headers['Authorization'] = 'Bearer ' + GP.token;

    const res = await fetch(path, {
        method,
        headers,
        body: form ? body : (body ? JSON.stringify(body) : undefined)
    });

    // auth expirou
    if (res.status === 401) {
        localStorage.removeItem('gp_token');
        if (!location.pathname.endsWith('/login.html')) location.href = '/login.html';
        throw new Error('auth');
    }

    // *** NOVO: DB ainda não configurado → redireciona para /setup.html ***
    if (res.status === 503) {
        // tenta ler o body para saber se é setup_required (não é obrigatório)
        let j = null; try { j = await res.json(); } catch { }
        if (j?.error === 'setup_required') {
            if (!location.pathname.endsWith('/setup.html')) location.href = '/setup.html';
            throw new Error('setup_required');
        }
    }

    if (!res.ok) {
        // tenta devolver texto legível
        const ct = res.headers.get('content-type') || '';
        throw new Error(ct.includes('application/json') ? JSON.stringify(await res.json()) : await res.text());
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
}

async function loadSettings() {
    try {
        GP.settings = await api('/api/settings');
        // aplicar cores no :root
        const r = document.documentElement;
        if (GP.settings.brand_primary) r.style.setProperty('--brand-primary', GP.settings.brand_primary);
        if (GP.settings.brand_secondary) r.style.setProperty('--brand-secondary', GP.settings.brand_secondary);
        if (GP.settings.brand_accent) r.style.setProperty('--brand-accent', GP.settings.brand_accent);
        if (GP.settings.heat_low) r.style.setProperty('--heat-low', GP.settings.heat_low);
        if (GP.settings.heat_mid) r.style.setProperty('--heat-mid', GP.settings.heat_mid);
        if (GP.settings.heat_high) r.style.setProperty('--heat-high', GP.settings.heat_high);
        // fundo de login
        if (location.pathname.endsWith('/login.html') && GP.settings.login_bg_url) {
            const wrap = document.querySelector('.login-wrap');
            if (wrap) {
                wrap.style.backgroundImage = `url('${GP.settings.login_bg_url}')`;
                wrap.style.filter = `blur(${GP.settings.login_bg_blur || 0}px) brightness(${(GP.settings.login_bg_brightness || 100) / 100})`;
            }
        }
    } catch (e) { console.warn('settings', e); }
}

async function loadMe() {
    if (!GP.token) return null;
    try {
        const data = await api('/api/me');
        GP.user = data.user;
        return GP.user;
    } catch (e) {
        GP.user = null;
        return null;
    }
}

function ensureAuthOrRedirect() {
    if (!GP.token) { location.href = '/login.html'; return false; }
    return true;
}

function logout() {
    localStorage.removeItem('gp_token');
    GP.token = null; GP.user = null;
    location.href = '/login.html';
}

// Navbar builder
function renderNavbar(activePath) {
    const wrap = document.getElementById('navbar');
    if (!wrap) return;
    const isLogged = !!GP.user;
    const isAdmin = GP.user && (GP.user.role_key === 'administrador' || GP.user.role_key === 'admin_master');
    wrap.innerHTML = `
    <div class="navbar">
      <div class="brand">
        <img src="/assets/logo.svg" alt="logo"/>
        <div>${(GP.settings && GP.settings.site_name) || 'Gabinete+'}</div>
      </div>
      <nav>
        <a href="/home.html">Início</a>
        ${isLogged ? `<a href="/profile.html">Perfil</a>` : ''}
        ${isLogged ? `<a href="/hierarchy.html">Hierarquia</a>` : ''}
        ${isAdmin ? `<a href="/admin.html">Admin</a>` : ''}
        ${isAdmin ? `<a href="/admin-users.html">Usuários</a>` : ''}
        ${isAdmin ? `<a href="/admin-heatmap.html">Mapa</a>` : ''}
        <a href="/about.html">Sobre</a>
        <a href="/contact.html">Fale conosco</a>
      </nav>
      <div class="right">
        ${isLogged ? `<span class="badge">${GP.user.first_name || 'Usuário'}</span>
        <button class="btn ghost" id="btnLogout">Sair</button>`:
            `<a class="btn" href="/login.html">Entrar</a>`}
      </div>
    </div>`;
    setActiveNav(activePath || location.pathname);
    const btn = document.getElementById('btnLogout');
    if (btn) btn.addEventListener('click', logout);
}

// Socket.io + presença
function startRealtime() {
    if (GP.socket) return;
    const s = document.createElement('script');
    s.src = '/socket.io/socket.io.js';
    s.onload = () => {
        GP.socket = io();
        GP.socket.emit('hello');
        GP.socket.on('presence:update', payload => {
            GP.presence.set(payload.user_id, Date.now());
            document.querySelectorAll(`[data-user="${payload.user_id}"]`).forEach(el => {
                el.classList.remove('away');
                el.classList.add('online');
            });
        });
        GP.socket.on('post:new', post => {
            document.dispatchEvent(new CustomEvent('gp:post:new', { detail: post }));
        });
        GP.socket.on('post:like', data => {
            document.dispatchEvent(new CustomEvent('gp:post:like', { detail: data }));
        });
    };
    document.body.appendChild(s);

    if (GP.token) {
        setInterval(() => api('/api/presence', { method: 'POST' }).catch(() => { }), 15000);
    }
}

// Push
async function initPush() {
    if (!('serviceWorker' in navigator)) return;
    await navigator.serviceWorker.ready;
}

// PWA SW
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.warn);
    }
}

// Helpers UI
function formatName(u) { return [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Sem nome'; }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

window.GP = GP;
window.api = api;
window.loadMe = loadMe;
window.loadSettings = loadSettings;
window.renderNavbar = renderNavbar;
window.ensureAuthOrRedirect = ensureAuthOrRedirect;
window.startRealtime = startRealtime;
window.initPush = initPush;
window.registerSW = registerSW;
window.formatName = formatName;
window.el = el;

// Boot comum a todas páginas
(async function boot() {
    await loadSettings();
    await loadMe();
    renderNavbar();
    registerSW();
    startRealtime();
    initPush();
})();
