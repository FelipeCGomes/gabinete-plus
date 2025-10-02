(async function () {
    if (!ensureAuthOrRedirect()) return;
    const me = GP.user || await loadMe();
    if (!(me && (me.role_key === 'administrador' || me.role_key === 'admin_master'))) {
        alert('Acesso restrito'); location.href = '/home.html'; return;
    }

    const canvas = document.getElementById('heatmap');
    const legend = document.getElementById('legend');

    // obter usuários e agrupar por cidade/RA
    const users = await api('/api/admin/users');
    const cities = {};
    users.forEach(u => {
        const key = (u.city || 'Sem cidade') + ' / ' + (u.ra_name || 'Sem RA');
        cities[key] = (cities[key] || 0) + 1;
    });
    const items = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 100);

    // desenhar grid simples
    const ctx = canvas.getContext('2d');
    const cols = 10, cell = 46, pad = 10;
    canvas.width = cols * cell + pad * 2; canvas.height = Math.ceil(items.length / cols) * cell + pad * 2;
    const max = Math.max(...items.map(i => i[1]));
    const low = getComputedStyle(document.documentElement).getPropertyValue('--heat-low').trim() || '#dc3545';
    const mid = getComputedStyle(document.documentElement).getPropertyValue('--heat-mid').trim() || '#fd7e14';
    const high = getComputedStyle(document.documentElement).getPropertyValue('--heat-high').trim() || '#0d6efd';

    function lerpColor(a, b, t) {
        const pa = a.match(/\w\w/g).map(h => parseInt(h, 16));
        const pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
        const pc = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
        return '#' + pc.map(v => v.toString(16).padStart(2, '0')).join('');
    }

    items.forEach((it, idx) => {
        const [label, count] = it;
        const row = Math.floor(idx / cols), col = idx % cols;
        const x = pad + col * cell, y = pad + row * cell;
        const t = count / max;
        const color = t < .5 ? lerpColor(low, mid, t * 2) : lerpColor(mid, high, (t - .5) * 2);
        ctx.fillStyle = color; ctx.fillRect(x, y, cell - 8, cell - 8);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = '700 10px Segoe UI';
        ctx.fillText(String(count), x + 6, y + 14);
    });

    legend.innerHTML = items.slice(0, 20).map(i => `<div class="badge">${i[0]}: ${i[1]}</div>`).join(' ');
})();
