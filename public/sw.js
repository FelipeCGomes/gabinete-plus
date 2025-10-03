const CACHE = 'gp-cache-v6';
const ASSETS = [
    '/', '/home.html', '/login.html',
    '/css/styles.css', '/js/app.js',
    '/js/pages/login.js', '/js/pages/home.js',
    '/js/pages/profile.js', '/js/pages/hierarchy.js',
    '/js/pages/admin.js', '/js/pages/admin-users.js', '/js/pages/admin-heatmap.js',
    '/js/pages/about.js', '/js/pages/contact.js',
    '/assets/logo.svg', '/assets/icon.png', '/assets/cover.jpg', '/manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k)))));
    self.clients.claim();
});
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request).then(res => {
            const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone));
            return res;
        }).catch(() => caches.match(e.request))
    );
});
