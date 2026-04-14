/**
 * PA壶喷芯估算台 — Service Worker
 * 策略：Cache First（离线优先），适合计算类工具
 */

const CACHE_NAME = 'foam-calc-v1';

// 需要缓存的资源列表
const PRECACHE_URLS = [
  '/foam-cannon-calculator',
  '/foam-cannon-calculator/index.html',
];

// 安装阶段：预缓存关键资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // 跳过等待，立即激活
      return self.skipWaiting();
    })
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // 立即接管所有页面
      return self.clients.claim();
    })
  );
});

// 请求拦截：Cache First 策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 跳过非同源请求（埋点、反馈 API 等）
  if (url.origin !== self.location.origin) return;

  // 跳过 Cloudflare Analytics 等第三方脚本
  if (url.hostname.includes('cloudflareinsights.com')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // 有缓存就用缓存，同时后台更新（stale-while-revalidate）
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {}); // 网络失败静默处理

        return cachedResponse;
      }

      // 没有缓存，走网络
      return fetch(request).then((networkResponse) => {
        // 缓存成功的响应
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // 网络也失败了，返回离线提示
        if (request.headers.get('Accept')?.includes('text/html')) {
          return caches.match('/foam-cannon-calculator/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
