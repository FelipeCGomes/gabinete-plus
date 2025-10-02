// public/sw.js
const CACHE = 'gp-cache-v2'; // mude para v3, v4... ao publicar alterações
const ASSETS = [
    '/', '/home.html', '/login.html', '/profile.html', '/hierarchy.html',
    '/admin.html', '/admin-users.html', '/admin-heatmap.html', '/about.html', '/contact.html',
    '/css/styles.css', '/js/app.js',
    '/js/pages/login.js', '/js/pages/home.js', '/js/pages/profile.js', '/js/pages/hierarchy.js',
    '/js/pages/admin.js', '/js/pages/admin-users.js', '/js/pages/admin-heatmap.js', '/js/pages/about.js', '/js/pages/contact.js',
    '/manifest.json', '/assets/logo.svg', '/assets/icon.png', '/assets/cover.jpg'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/')) {
        // network-first para API
        e.respondWith(
            fetch(e.request).catch(() => caches.match('/login.html'))
        );
        return;
    }
    e.respondWith(
        caches.match(e.request).then(resp => resp || fetch(e.request).then(r => {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
            return r;
        }).catch(() => caches.match('/login.html')))
    );
});

// Notificações push (opcional)
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data.json(); } catch { }
    const title = data.title || 'Gabinete+';
    const options = {
        body: data.body || 'Você tem novidades.',
        icon: '/assets/icon.png',
        badge: '/assets/icon.png',
        data: data.url || '/home.html'
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = event.notification.data || '/home.html';
    event.waitUntil(clients.openWindow(target));
});
