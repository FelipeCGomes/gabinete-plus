(async function () {
    await loadSettings();

    // mostrar foto candidato no cabeçalho
    const img = document.getElementById('candidatePhoto');
    if (img && GP.settings?.login_candidate_photo) {
        img.src = GP.settings.login_candidate_photo;
    }

    // se veio com invite, mostrar aviso
    const params = new URLSearchParams(location.search);
    const invite = params.get('invite');
    if (invite) {
        const inv = await api('/api/invitations/' + invite).catch(() => null);
        if (inv) {
            const box = document.getElementById('inviteBox');
            box.style.display = 'block';
            box.querySelector('b').textContent = inv.full_name || (inv.phone || 'Convite');
            document.getElementById('btnCompleteInvite').onclick = () => location.href = `/setup.html?invite=${invite}`;
        }
    }

    const form = document.getElementById('formLogin');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const b = document.getElementById('btnLogin');
        b.disabled = true; b.textContent = 'Entrando...';
        try {
            const data = await api('/api/login', { method: 'POST', body: { phone, password } });
            GP.token = data.token; localStorage.setItem('gp_token', data.token);
            GP.user = data.user;
            location.href = '/home.html';
        } catch (err) {
            alert('Login inválido');
        } finally {
            b.disabled = false; b.textContent = 'Entrar';
        }
    });
})();
