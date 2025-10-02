(async function () {
    await loadSettings();
    const s = GP.settings || {};
    document.getElementById('aboutPhoto').src = (s.login_candidate_photo || '/assets/icon.png');
    document.getElementById('aboutText').textContent = s.about_text || 'Bem-vindo ao Gabinete+, uma plataforma de engajamento e gestão política.';
})();
