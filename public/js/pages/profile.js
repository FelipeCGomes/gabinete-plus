(function () {
    if (!ensureAuthOrRedirect()) return;

    const form = document.getElementById('formProfile');
    const img = document.getElementById('avatarImg');
    const inputFile = document.getElementById('avatarFile');

    // preencher campos
    (async () => {
        const me = GP.user || await loadMe();
        if (!me) return;
        form.first_name.value = me.first_name || '';
        form.last_name.value = me.last_name || '';
        form.address.value = me.address || '';
        form.cep.value = me.cep || '';
        form.city.value = me.city || '';
        img.src = me.avatar_url || '/assets/icon.png';
        document.getElementById('inviterName').textContent = me.inviter_name || '—';

        // carregar RAs
        const ra = await api('/api/ra').catch(() => []);
        const sel = form.ra_id;
        ra.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; sel.appendChild(o); });
        if (me.ra_id) sel.value = me.ra_id;
    })();

    // CROP SIMPLES (zoom + arrastar)
    let zoom = 1, pos = { x: 0, y: 0 }, start = null, imgPreview = null;
    const cropper = document.getElementById('cropper');
    const zoomRange = document.getElementById('zoomRange');
    inputFile.addEventListener('change', () => {
        const f = inputFile.files[0]; if (!f) return;
        const url = URL.createObjectURL(f);
        if (!imgPreview) { imgPreview = document.createElement('img'); cropper.appendChild(imgPreview); }
        imgPreview.src = url; imgPreview.style.transform = `translate(${pos.x}px,${pos.y}px) scale(${zoom})`;
    });
    zoomRange.addEventListener('input', () => {
        zoom = parseFloat(zoomRange.value);
        if (imgPreview) imgPreview.style.transform = `translate(${pos.x}px,${pos.y}px) scale(${zoom})`;
    });
    cropper.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; cropper.setPointerCapture(e.pointerId); });
    cropper.addEventListener('pointermove', e => {
        if (!start || !imgPreview) return;
        pos.x += (e.clientX - start.x); pos.y += (e.clientY - start.y);
        start = { x: e.clientX, y: e.clientY };
        imgPreview.style.transform = `translate(${pos.x}px,${pos.y}px) scale(${zoom})`;
    });
    cropper.addEventListener('pointerup', () => start = null);

    async function exportCroppedDataURL() {
        if (!imgPreview) return null;
        const box = cropper.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = 360; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const imgEl = imgPreview;
        const imgW = imgEl.naturalWidth, imgH = imgEl.naturalHeight;

        // mapear deslocamento relativo
        const scale = zoom;
        const offsetX = pos.x;
        const offsetY = pos.y;

        // desenhar imagem com transformação aproximada
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        ctx.translate(offsetX / 2, offsetY / 2);
        ctx.drawImage(imgEl, -imgW / 2, -imgH / 2);
        ctx.restore();
        return canvas.toDataURL('image/jpeg', .9);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let avatarDataUrl = null;
        if (imgPreview) avatarDataUrl = await exportCroppedDataURL();

        const payload = {
            first_name: form.first_name.value.trim(),
            last_name: form.last_name.value.trim(),
            address: form.address.value.trim(),
            cep: form.cep.value.trim(),
            city: form.city.value.trim(),
            ra_id: form.ra_id.value ? +form.ra_id.value : null,
            avatar_url: avatarDataUrl || undefined
        };
        try {
            await api('/api/users/me', { method: 'PUT', body: payload });
            alert('Perfil atualizado!');
            if (avatarDataUrl) img.src = avatarDataUrl;
        } catch (e) { alert('Falha ao atualizar perfil'); }
    });
})();
