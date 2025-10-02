(async function () {
    await loadSettings();
    renderNavbar();

    const params = new URLSearchParams(location.search);
    const invite = params.get('invite'); // completar convite
    if (invite) {
        document.getElementById('setupDB').style.display = 'none';
        document.getElementById('completeInvite').style.display = 'block';

        const form = document.getElementById('formCompleteInvite');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                phone: form.phone.value.trim(),
                password: form.password.value,
                first_name: form.first_name.value.trim(),
                last_name: form.last_name.value.trim(),
                cep: form.cep.value.trim(),
                city: form.city.value.trim(),
                ra_id: form.ra_id.value ? +form.ra_id.value : null
            };
            try {
                await api(`/api/invitations/${invite}/complete`, { method: 'POST', body: payload });
                alert('Cadastro enviado para validação. Aguarde aprovação.');
                location.href = '/login.html';
            } catch (e) { alert('Erro ao concluir: verifique os dados.'); }
        });

        // carregar RAs
        const ra = await api('/api/ra').catch(() => []);
        const sel = form.ra_id;
        ra.forEach(r => {
            const o = document.createElement('option');
            o.value = r.id; o.textContent = r.name; sel.appendChild(o);
        });
        return;
    }

    // SETUP INICIAL DO SISTEMA (DB + aparência + admin master)
    const formDB = document.getElementById('formSetup');
    const dbType = document.getElementById('db_type');
    const candidateInput = document.getElementById('candidate_photo');
    const bgInput = document.getElementById('login_bg');

    formDB.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(formDB);
        const btn = document.getElementById('btnSetup');
        btn.disabled = true; btn.textContent = 'Configurando...';

        try {
            await fetch('/api/setup', { method: 'POST', body: fd });
            alert('Base criada! Agora crie o Admin Master.');
            document.getElementById('adminMaster').style.display = 'block';
            document.getElementById('setupDB').scrollIntoView({ behavior: 'smooth' });
        } catch (e) { alert('Falha no setup: verifique as credenciais do banco e tente novamente.'); }
        finally { btn.disabled = false; btn.textContent = 'Salvar & Criar Tabelas'; }
    });

    const formAdmin = document.getElementById('formAdminMaster');
    formAdmin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            phone: formAdmin.phone.value.trim(),
            cpf: formAdmin.cpf.value.trim(),
            password: formAdmin.password.value
        };
        const b = document.getElementById('btnAdminMaster');
        b.disabled = true; b.textContent = 'Criando...';
        try {
            await api('/api/setup/admin-master', { method: 'POST', body: payload });
            alert('Admin Master criado! Faça login.');
            location.href = '/login.html';
        } catch (e) { alert('Erro ao criar Admin Master.'); }
        finally { b.disabled = false; b.textContent = 'Criar Admin Master'; }
    });
})();
