(async function () {
    const form = document.getElementById('formContact');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: form.name.value.trim(),
            phone: form.phone.value.trim(),
            email: form.email.value.trim(),
            city: form.city.value.trim(),
            uf: form.uf.value.trim().slice(0, 2),
            message: form.message.value.trim()
        };
        try {
            await api('/api/contact', { method: 'POST', body: payload });
            alert('Mensagem enviada! Obrigado.');
            form.reset();
        } catch (e) { alert('Falha ao enviar, tente novamente.'); }
    });
})();
