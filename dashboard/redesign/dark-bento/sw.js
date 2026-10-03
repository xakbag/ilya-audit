"use strict";
// Сброс: удаляет все кэши прежних версий и себя; страница дальше грузится прямо из сети.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: "window" }))
    .then(cs => cs.forEach(c => c.navigate(c.url))));
});
