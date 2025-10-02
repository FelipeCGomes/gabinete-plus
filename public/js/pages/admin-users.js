(async function () {
    if (!ensureAuthOrRedirect()) return;
    const me = GP.user || await loadMe();
    if (!(me && (me.role_key === 'administrador' || me.role_key === 'admin_master'))) {
        alert('Acesso restrito'); location.href = '/home.html'; return;
    }

    const tbody = document.getElementById('usersBody');

    async function loadUsers() {
        const list = await api('/api/admin/users');
        tbody.innerHTML = '';
        list.forEach(u => {
            const goalTxt = u.goal_enabled ? `${u.referrals_valid}/${u.goal_total || 0}` : '—';
            tbody.appendChild(el(`<tr>
        <td>${u.id}</td>
        <td>${u.first_name || ''} ${u.last_name || ''}<br><small>${u.phone || ''}</small></td>
        <td>${u.ra_name || ''}</td>
        <td><span class="badge">${u.role_key}</span></td>
        <td>${u.referrals_valid}</td>
        <td>${u.referrals_pending}</td>
        <td>${goalTxt} ${u.goal_enabled ? `<button class="btn ghost" data-metrics="${u.id}">ver</button>` : ''}</td>
        <td>
          <select class="select" data-status="${u.id}">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>Ativo</option>
            <option value="pending" ${u.status === 'pending' ? 'selected' : ''}>Pendente</option>
            <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>Inativo</option>
            <option value="blocked" ${u.status === 'blocked' ? 'selected' : ''}>Bloqueado</option>
          </select>
        </td>
      </tr>`));
        });
    }

    tbody.addEventListener('change', async (e) => {
        const sel = e.target.closest('select[data-status]');
        if (!sel) return;
        const id = sel.getAttribute('data-status');
        await api(`/api/admin/users/${id}/status`, { method: 'POST', body: { status: sel.value } });
    });

    // modal simples de métricas
    const modal = document.getElementById('metricsModal');
    const close = document.getElementById('closeMetrics');
    close.onclick = () => modal.close();

    tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-metrics]');
        if (!btn) return;
        const id = btn.getAttribute('data-metrics');
        const data = await api(`/api/admin/users/${id}/metrics`);
        // desenhar donuts e barras manualmente
        const donut = document.getElementById('donut');
        const bars = document.getElementById('bars');
        drawDonut(donut, data.goal_total, data.valid);
        drawBars(bars, data.valid, data.pending);
        modal.showModal();
    });

    function drawDonut(canvas, total, done) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width = 220, h = canvas.height = 220, cx = w / 2, cy = h / 2, r = 80;
        ctx.clearRect(0, 0, w, h);
        // bg
        ctx.lineWidth = 24; ctx.strokeStyle = 'rgba(255,255,255,.15)';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        // progress
        const frac = total > 0 ? Math.min(done / total, 1) : 0;
        ctx.strokeStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
        // text
        ctx.fillStyle = '#e5e7eb'; ctx.font = '700 18px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(`${done}/${total}`, cx, cy + 6);
    }

    function drawBars(canvas, valid, pending) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width = 260, h = canvas.height = 160;
        ctx.clearRect(0, 0, w, h);
        const max = Math.max(1, valid, pending);
        const bw = 60, gap = 40, x1 = 50, x2 = x1 + bw + gap;
        // axes
        ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath();
        ctx.moveTo(30, h - 30); ctx.lineTo(w - 20, h - 30); ctx.stroke();
        // valid
        ctx.fillStyle = '#0ea5e9';
        const vh = (h - 60) * (valid / max);
        ctx.fillRect(x1, h - 30 - vh, bw, vh);
        // pending
        ctx.fillStyle = '#f59e0b';
        const ph = (h - 60) * (pending / max);
        ctx.fillRect(x2, h - 30 - ph, bw, ph);
        // labels
        ctx.fillStyle = '#cbd5e1'; ctx.font = '600 14px Segoe UI';
        ctx.fillText('Validados', x1 + bw / 2, h - 10);
        ctx.fillText('Pendentes', x2 + bw / 2, h - 10);
    }

    // Exportar / Importar (somente admin)
    document.getElementById('btnExport').onclick = () => {
        const a = document.createElement('a');
        a.href = '/api/admin/users/export.txt';
        a.setAttribute('download', 'usuarios.txt');
        a.click();
    };
    document.getElementById('btnImport').onclick = async () => {
        const text = prompt('Cole o conteúdo do .txt (nome;sobrenome;telefone;senha;role;cidade;ra_id)');
        if (!text) return;
        await api('/api/admin/users/import.txt', { method: 'POST', body: { text } });
        alert('Importado!');
        loadUsers();
    };

    loadUsers();
})();
