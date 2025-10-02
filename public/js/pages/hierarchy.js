(async function () {
    if (!ensureAuthOrRedirect()) return;

    const data = await api('/api/hierarchy/me');
    const wrap = document.getElementById('orgWrap');

    function node(user) {
        return `
    <div class="node">
      <img class="pic ${GP.presence.get(user.id) ? 'online' : ''}" data-user="${user.id}" src="${user.avatar_url || '/assets/icon.png'}">
      <div style="font-weight:700">${(user.first_name || '') + ' ' + (user.last_name || '')}</div>
    </div>`;
    }

    const me = node(data.me);
    const L1 = data.level1.map(u => node(u)).join('');
    const L2 = data.level2.map(u => node(u)).join('');

    wrap.innerHTML = `
    <div class="org">
      <div style="text-align:center">${me}</div>
      <div class="link"></div>
      <div style="display:flex; justify-content:center; flex-wrap:wrap">${L1}</div>
      ${L2 ? `<div class="link"></div><div style="display:flex; justify-content:center; flex-wrap:wrap">${L2}</div>` : ''}
    </div>
  `;
})();
