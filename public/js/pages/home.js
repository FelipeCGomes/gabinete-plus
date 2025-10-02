(function () {
    if (!ensureAuthOrRedirect()) return;

    let currentType = 'text';
    const avatarEl = document.getElementById('composerAvatar');
    const txt = document.getElementById('composerText');
    const media = document.getElementById('composerMedia');
    const poll = document.getElementById('composerPoll');
    const eventBox = document.getElementById('composerEvent');
    const fileInput = document.getElementById('fileInput');

    // avatar + presença
    if (GP.user?.avatar_url) avatarEl.src = GP.user.avatar_url;
    avatarEl.classList.add('online');

    function pickType(t) {
        currentType = t;
        txt.style.display = (t === 'text' || t === 'photo' || t === 'video' || t === 'poll' || t === 'event') ? 'block' : 'none';
        media.style.display = (t === 'photo' || t === 'video') ? 'block' : 'none';
        poll.style.display = (t === 'poll') ? 'block' : 'none';
        eventBox.style.display = (t === 'event') ? 'grid' : 'none';
        if (t === 'photo' || t === 'video') fileInput.click();
    }

    document.getElementById('btnText').onclick = () => pickType('text');
    document.getElementById('btnPhoto').onclick = () => pickType('photo');
    document.getElementById('btnVideo').onclick = () => pickType('video');
    document.getElementById('btnPoll').onclick = () => pickType('poll');
    document.getElementById('btnEvent').onclick = () => pickType('event');

    document.getElementById('btnPublish').addEventListener('click', async () => {
        const fd = new FormData();
        fd.append('type', currentType);
        fd.append('content', txt.value.trim());
        if (currentType === 'photo' || currentType === 'video') {
            if (fileInput.files[0]) fd.append('media', fileInput.files[0]);
        }
        if (currentType === 'poll') {
            const options = document.getElementById('pollOptions').value.trim(); // "A;B;C"
            if (!options) return alert('Adicione opções separadas por ;');
            fd.append('options', options);
        }
        if (currentType === 'event') {
            fd.append('event_date', document.getElementById('eventDate').value);
            fd.append('event_place', document.getElementById('eventPlace').value);
        }
        try {
            const post = await fetch('/api/posts', {
                method: 'POST', headers: { Authorization: 'Bearer ' + GP.token }, body: fd
            }).then(r => r.json());
            prependPost(post);
            txt.value = ''; fileInput.value = '';
            document.getElementById('pollOptions').value = '';
            document.getElementById('eventDate').value = '';
            document.getElementById('eventPlace').value = '';
        } catch (e) { alert('Erro ao publicar'); }
    });

    // carregar feed
    async function loadFeed() {
        const posts = await api('/api/posts');
        const list = document.getElementById('feed');
        list.innerHTML = '';
        posts.forEach(p => list.appendChild(renderPost(p)));
    }

    function prependPost(p) { document.getElementById('feed').prepend(renderPost(p)); }

    function renderPost(p) {
        const meLikeId = `likes-${p.id}`;
        const elPost = el(`
      <div class="card post" id="post-${p.id}">
        <div class="head">
          <img class="avatar ${GP.presence.get(p.author_id) ? 'online' : ''}" data-user="${p.author_id}" src="${p.avatar_url || '/assets/icon.png'}" alt="">
          <div>
            <div class="name">${(p.first_name || '') + ' ' + (p.last_name || '')}</div>
            <div class="badge">${new Date(p.created_at || Date.now()).toLocaleString()}</div>
          </div>
        </div>
        <div class="body">
          ${p.content ? `<div>${p.content.replace(/@todos/gi, '<b>@todos</b>')}</div>` : ''}
          ${p.media_url ? `<div class="media">${p.type === 'video' ? `<video controls src="${p.media_url}"></video>` : `<img src="${p.media_url}" />`}</div>` : ''}
          ${Array.isArray(p.options) && p.options.length ? renderPoll(p) : ''}
          ${p.type === 'event' ? `<div class="card"><b>Evento:</b> ${p.event_date || ''} – ${p.event_place || ''}</div>` : ''}
        </div>
        <div class="reactions">
          <button class="icon-btn" data-like="${p.id}">👍 Curtir <span id="${meLikeId}">${p.likes || 0}</span></button>
        </div>
      </div>
    `);
        // like
        elPost.querySelector('[data-like]').onclick = async () => {
            const r = await api(`/api/posts/${p.id}/like`, { method: 'POST' });
            document.getElementById(meLikeId).textContent = r.likes;
        };
        return elPost;
    }

    function renderPoll(p) {
        const containerId = `poll-${p.id}`;
        const opts = p.options.map(o => `<label><input type="radio" name="poll-${p.id}" value="${o.id}"> ${o.text} <small class="badge">${o.votes || 0}</small></label>`).join('<br/>');
        return `<div id="${containerId}" class="card">
      <b>Enquete</b><div style="margin-top:6px">${opts}</div>
      <button class="btn" data-vote="${p.id}">Votar</button>
    </div>`;
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-vote]');
        if (!btn) return;
        const pid = btn.getAttribute('data-vote');
        const sel = document.querySelector(`input[name="poll-${pid}"]:checked`);
        if (!sel) return alert('Escolha uma opção');
        const option_id = sel.value;
        try {
            const res = await api(`/api/posts/${pid}/vote`, { method: 'POST', body: { option_id } });
            // atualizar contagem
            const box = document.getElementById(`poll-${pid}`);
            box.querySelectorAll('label').forEach(lbl => {
                const id = lbl.querySelector('input').value;
                const found = res.options.find(o => o.id === id);
                if (found) lbl.querySelector('.badge').textContent = found.votes || 0;
            });
            btn.disabled = true; btn.textContent = 'Voto computado';
        } catch (e) { alert('Já votou ou erro.'); }
    });

    // banners cards
    async function loadBanners() {
        const list = await api('/api/banners').catch(() => []);
        const wrap = document.getElementById('bannerGrid');
        wrap.innerHTML = '';
        list.forEach(b => {
            wrap.appendChild(el(`
        <a class="banner" href="${b.link_url || '#'}" target="_blank" rel="noreferrer">
          <img src="${b.image_url}" alt="${b.title || ''}">
        </a>
      `));
        });
    }

    // realtime updates
    document.addEventListener('gp:post:new', (ev) => prependPost(ev.detail));
    document.addEventListener('gp:post:like', (ev) => {
        const d = ev.detail;
        const span = document.querySelector(`#likes-${d.post_id}`);
        if (span) span.textContent = d.likes;
    });

    loadFeed();
    loadBanners();
})();
