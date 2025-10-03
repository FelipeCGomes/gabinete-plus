// app.js
// Overlay de bootstrap robusto: consulta /api/bootstrap/status,
// trata 502/Failed to fetch e permite "Tentar novamente" (POST /api/bootstrap/retry)

(function () {
    const POLL_EVERY_MS = 2000;

    function el(html) {
        const d = document.createElement('div');
        d.innerHTML = html.trim();
        return d.firstElementChild;
    }

    const overlay = el(`
    <div id="gp-bootstrap" style="
      position: fixed; inset: 0; background: rgba(0,0,0,.6);
      display: none; align-items: center; justify-content: center; z-index: 9999;
    ">
      <div style="background:#fff; max-width:520px; width:92%; border-radius:14px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 8px 0; font-weight:700;">Inicializando Banco de Dados…</h3>
        <p id="gp-msg" style="margin:0 0 8px 0; color:#333;">Verificando status…</p>
        <pre id="gp-err" style="display:none; background:#f8e8e8; color:#b00020; padding:10px; border-radius:8px; white-space:pre-wrap"></pre>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button id="gp-retry" style="display:none; padding:10px 14px; border-radius:8px; border:0; background:#0D6EFD; color:#fff; cursor:pointer">Tentar novamente</button>
          <button id="gp-hide"  style="display:none; padding:10px 14px; border-radius:8px; border:1px solid #ccc; background:#fafafa; cursor:pointer">Ocultar</button>
        </div>
      </div>
    </div>
  `);

    document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(overlay);
        startPolling();
    });

    let timer = null;

    async function fetchStatus() {
        const r = await fetch('/api/bootstrap/status', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin'
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }

    async function pollOnce() {
        const msg = overlay.querySelector('#gp-msg');
        const err = overlay.querySelector('#gp-err');
        const btnRetry = overlay.querySelector('#gp-retry');
        const btnHide = overlay.querySelector('#gp-hide');

        try {
            const s = await fetchStatus();

            // Exibir overlay se ainda não está pronto
            if (!s.ok) {
                overlay.style.display = 'flex';
                err.style.display = 'none';
                btnRetry.style.display = 'none';
                btnHide.style.display = 'none';

                let human = 'Verificando...';
                if (s.stage === 'connecting') human = 'Conectando ao banco...';
                else if (s.stage === 'creating_schema') human = 'Criando/validando tabelas...';
                else if (s.stage === 'creating_admin') human = 'Criando Admin Master...';
                else if (s.stage === 'error') human = 'Erro ao inicializar';
                msg.textContent = human;

                if (s.stage === 'error') {
                    err.style.display = 'block';
                    err.textContent = s.error || 'Erro desconhecido';
                    btnRetry.style.display = 'inline-block';
                    btnHide.style.display = 'inline-block';
                }
            } else {
                // Pronto: sumir com overlay
                overlay.style.display = 'none';
            }
        } catch (e) {
            // Falha de rede, 502, etc.
            overlay.style.display = 'flex';
            msg.textContent = 'Servidor reiniciando ou indisponível. Tentando novamente...';
            const errBox = overlay.querySelector('#gp-err');
            errBox.style.display = 'block';
            errBox.textContent = String(e?.message || e);
            const btnRetry = overlay.querySelector('#gp-retry');
            const btnHide = overlay.querySelector('#gp-hide');
            btnRetry.style.display = 'inline-block';
            btnHide.style.display = 'inline-block';
        }
    }

    function startPolling() {
        stopPolling();
        pollOnce();
        timer = setInterval(pollOnce, POLL_EVERY_MS);
    }

    function stopPolling() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    overlay.addEventListener('click', (ev) => {
        if (ev.target.id === 'gp-hide') {
            overlay.style.display = 'none';
        }
        if (ev.target.id === 'gp-retry') {
            fetch('/api/bootstrap/retry', { method: 'POST' })
                .catch(() => { })   // se cair, o polling cuidará
                .finally(() => startPolling());
        }
    });
})();
