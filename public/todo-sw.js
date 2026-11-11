/* Only cache a generic offline screen. Never cache accounts, schedules, chats,
   login responses, API requests, or Next.js page data. */
const SHELL_CACHE = "xipo-todo-offline-v1";
const OFFLINE_URL = "/todo-offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("xipo-todo-offline-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || !["/todo", "/login"].includes(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.status < 500) return response;
    } catch { /* Network unavailable: show only the generic, cached shell. */ }
    return (await caches.open(SHELL_CACHE)).match(OFFLINE_URL).then((response) => response || new Response("暂时无法连接，请检查网络后刷新。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  })());
});
