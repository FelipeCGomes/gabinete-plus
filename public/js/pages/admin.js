(async function () {
  if (!ensureAuthOrRedirect()) return;
  const me = GP.user || await loadMe();
  if (!(me && (me.role_key === 'administrador' || me.role_key === 'admin_master'))) {
    alert('Acesso restrito'); location.href = '/home.html'; return;
  }

  // Settings
  const form = document.getElementById('formSettings');
  const siteName = document.getElementById('site_name');

  // Carregar RAs na subaba
  const raList = document.getElementById('raList');
  async function refreshRA() {
    const ra = await api('/api/ra');
    raList.innerHTML = '';
    ra.forEach(r => {
      const li = el(`<li>${r.name} <button class="btn danger" data-del="${r.id}">X</button></li>`);
      raList.appendChild(li);
    });
  }

  // Banners (cards)
  const bannersWrap = document.getElementById('bannersWrap');
  async function refreshBanners() {
    const list = await api('/api/admin/banners');
    bannersWrap.innerHTML = '';
    list.forEach(b => {
      bannersWrap.appendChild(el(`
        <div class="card">
          <img style="height:120px;object-fit:cover;border-radius:12px" src="${b.image_url}">
          <div style="display:flex;gap:8px;margin-top:8px">
            <!-- CORREÇÃO AQUI: removido ': ''' extra -->
            <button class="btn ${b.active ? 'secondary' : ''}" data-toggle="${b.id}">${b.active ? 'Desativar' : 'Ativar'}</button>
            <button class="btn danger" data-delb="${b.id}">Excluir</button>
          </div>
        </div>
      `));
    });
  }

  // init
  await loadSettings();
  siteName.value = GP.settings?.site_name || 'Gabinete+';
  ['brand_primary', 'brand_secondary', 'brand_accent', 'heat_low', 'heat_mid', 'heat_high', 'about_text'].forEach(k => {
    if (GP.settings?.[k] != null) {
      const elInput = document.getElementById(k);
      if (elInput) elInput.value = GP.settings[k];
    }
  });

  document.getElementById('btnSaveSettings').onclick = async () => {
    const payload = {
      site_name: siteName.value.trim(),
      brand_primary: document.getElementById('brand_primary').value,
      brand_secondary: document.getElementById('brand_secondary').value,
      brand_accent: document.getElementById('brand_accent').value,
      heat_low: document.getElementById('heat_low').value,
      heat_mid: document.getElementById('heat_mid').value,
      heat_high: document.getElementById('heat_high').value,
      candidate_photo: document.getElementById('candidate_url').value || null,
      about_text: document.getElementById('about_text').value
    };
    await api('/api/settings', { method: 'POST', body: payload });
    alert('Configurações salvas!');
    await loadSettings();
    renderNavbar();
  };

  // RA
  document.getElementById('btnAddRA').onclick = async () => {
    const name = prompt('Nome da R.A / Área:');
    if (!name) return;
    await api('/api/ra', { method: 'POST', body: { name } });
    refreshRA();
  };
  raList.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-del]');
    if (!b) return;
    if (!confirm('Excluir este item?')) return;
    await api('/api/ra/' + b.getAttribute('data-del'), { method: 'DELETE' });
    refreshRA();
  });

  // Banners
  document.getElementById('bannerFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData();
    fd.append('image', f);
    const title = prompt('Título (opcional):') || '';
    const link = prompt('Link (opcional):') || '';
    fd.append('title', title); fd.append('link_url', link);
    await fetch('/api/admin/banners', { method: 'POST', headers: { Authorization: 'Bearer ' + GP.token }, body: fd });
    refreshBanners();
  });
  bannersWrap.addEventListener('click', async (e) => {
    const tgl = e.target.closest('button[data-toggle]');
    const del = e.target.closest('button[data-delb]');
    if (tgl) {
      await api('/api/admin/banners/' + tgl.getAttribute('data-toggle'), { method: 'PUT', body: { activeToggle: true } });
      refreshBanners();
    }
    if (del) {
      if (!confirm('Excluir banner?')) return;
      await api('/api/admin/banners/' + del.getAttribute('data-delb'), { method: 'DELETE' });
      refreshBanners();
    }
  });

  refreshRA();
  refreshBanners();
})();
