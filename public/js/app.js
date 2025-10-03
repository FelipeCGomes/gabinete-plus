const GP = { token: localStorage.getItem('gp_token') || null, user: null, settings: null, socket: null };

function setActiveNav(path) { document.querySelectorAll('.navbar nav a').forEach(a => a.getAttribute('href') === path ? a.classList.add('active') : a.classList.remove('active')); }

async function api(path, { method = 'GET', body, form = false, noStore = false } = {}) {
    const headers = {}; if (!form) headers['Content-Type'] = 'application/json'; if (GP.token) headers['Authorization'] = 'Bearer ' + GP.token;
    const res = await fetch(path + (noStore ? (path.includes('?') ? '&' : '?') + 'nc=' + Date.now() : ''), { method, headers, body: form ? body : (body ? JSON.stringify(body) : undefined), cache: noStore ? 'no-store' : 'default' });
    if (res.status === 401) { localStorage.removeItem('gp_token'); if (!location.pathname.endsWith('/login.html')) location.href = '/login.html'; throw new Error('auth'); }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
    return data;
}

async function loadSettings() {
    try {
        GP.settings = await api('/api/settings', { noStore: true });
        const r = document.documentElement;
        if (GP.settings.brand_primary) r.style.setProperty('--brand-primary', GP.settings.brand_primary);
        if (GP.settings.brand_secondary) r.style.setProperty('--brand-secondary', GP.settings.brand_secondary);
        if (GP.settings.brand_accent) r.style.setProperty('--brand-accent', GP.settings.brand_accent);
        if (GP.settings.heat_low) r.style.setProperty('--heat-low', GP.settings.heat_low);
        if (GP.settings.heat_mid) r.style.setProperty('--heat-mid', GP.settings.heat_mid);
        if (GP.settings.heat_high) r.style.setProperty('--heat-high', GP.settings.heat_high);
    } catch (e) { console.warn('settings', e); }
}

async function loadMe() { if (!GP.token) return null; try { const data = await api('/api/me', { noStore: true }); GP.user = data.user; return GP.user; } catch { GP.user = null; return null; } }
function ensureAuthOrRedirect() { if (!GP.token) { location.href = '/login.html'; return false; } return true; }
function logout() { localStorage.removeItem('gp_token'); GP.token = null; GP.user = null; location.href = '/login.html'; }

function renderNavbar(activePath) {
    const wrap = document.getElementById('navbar'); if (!wrap) return;
    const isLogged = !!GP.user; const isAdmin = GP.user && (GP.user.role_key === 'administrador' || GP.user.role_key === 'admin_master');
    wrap.innerHTML = `
    <div class="navbar">
      <div class="brand"><img src="/assets/logo.svg" alt="logo"/><div>${(GP.settings && GP.settings.site_name) || 'Gabinete+'}</div></div>
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
        ${isLogged ? `<span class="badge">${GP.user.first_name || 'Usuário'}</span><button class="btn ghost" id="btnLogout">Sair</button>` : `<a class="btn" href="/login.html">Entrar</a>`}
      </div>
    </div>`;
    if (activePath) setActiveNav(activePath); else setActiveNav(location.pathname);
    const btn = document.getElementById('btnLogout'); if (btn) btn.addEventListener('click', logout);
}

function bootstrapOverlay() {
    let box = document.getElementById('bootstrapOverlay');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'bootstrapOverlay';
    box.innerHTML = `
    <div class="bo-wrap">
      <div class="bo-card">
        <h3>Inicializando Banco de Dados…</h3>
        <div id="bo-log" class="bo-log"></div>
        <div id="bo-error" class="bo-error" style="display:none"></div>
        <div class="bo-actions">
          <button id="bo-retry" class="btn" style="display:none">Tentar novamente</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(box);
    return box;
}
function hideBootstrapOverlay() { const box = document.getElementById('bootstrapOverlay'); if (box) box.remove(); }

async function pollBootstrap() {
    const box = bootstrapOverlay();
    const $log = box.querySelector('#bo-log');
    const $err = box.querySelector('#bo-error');
    const $retry = box.querySelector('#bo-retry');

    async function tick() {
        try {
            const st = await api('/api/bootstrap/status', { noStore: true });
            $log.innerHTML = st.steps.map(s => `<div>• ${new Date(s.t).toLocaleTimeString()} — ${s.msg}</div>`).join('');
            if (st.error) {
                $err.style.display = 'block';
                $err.textContent = 'Erro: ' + st.error;
                $retry.style.display = 'inline-block';
            } else {
                $err.style.display = 'none';
                $retry.style.display = 'none';
            }
            if (st.ready) {
                hideBootstrapOverlay();
                await loadSettings();
                await loadMe();
                renderNavbar();
                return;
            }
            setTimeout(tick, 1500);
        } catch (e) {
            $err.style.display = 'block';
            $err.textContent = 'Falha ao consultar status. ' + e.message;
            $retry.style.display = 'inline-block';
        }
    }
    $log.innerHTML = '<div>• Aguardando…</div>';
    $retry.onclick = async () => {
        $err.style.display = 'none';
        $retry.style.display = 'none';
        try {
            await api('/api/bootstrap/retry', { method: 'POST' });
            setTimeout(tick, 800);
        } catch (e) {
            $err.style.display = 'block';
            $err.textContent = 'Não foi possível reiniciar: ' + e.message;
            $retry.style.display = 'inline-block';
        }
    };
    tick();
}

function registerSW() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(console.warn); }

window.api = api; window.loadMe = loadMe; window.loadSettings = loadSettings; window.renderNavbar = renderNavbar;
window.logout = logout; window.pollBootstrap = pollBootstrap; window.registerSW = registerSW;

(async function boot() {
    registerSW();
    // inicia overlay de bootstrap assim que carregar qualquer página
    pollBootstrap();
})();
