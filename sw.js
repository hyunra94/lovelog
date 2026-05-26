// ============================================================
// LOVE LOG — Service Worker
// 역할: PWA 설치 + 갤러리 공유 처리 (Web Share Target)
// ============================================================

const SHARE_CACHE = 'love-log-share-v1';
const SW_VER = 'v1.0';

// ── 설치 & 활성화 ───────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// ── Fetch 인터셉트 ──────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 갤러리 공유 진입점 처리
  if (url.pathname === '/lovelog/share-target' && event.request.method === 'POST') {
    // 1) 즉시 메인 페이지로 리다이렉트 (사용자에게 빠른 응답)
    event.respondWith(Response.redirect('/lovelog/?shared=1', 303));
    // 2) 백그라운드에서 공유된 파일을 Cache에 저장
    event.waitUntil(saveSharedFiles(event.request.clone()));
    return;
  }

  // 나머지는 네트워크 우선 통과
});

// ── 공유 파일 Cache 저장 ────────────────────────────────────
async function saveSharedFiles(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('media');
    if (!files.length) return;

    const cache = await caches.open(SHARE_CACHE);

    // 기존 캐시 초기화
    const oldKeys = await cache.keys();
    await Promise.all(oldKeys.map(k => cache.delete(k)));

    // 각 파일 저장
    const meta = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const cacheKey = `/lovelog/shared-file-${i}`;

      // ArrayBuffer로 변환 후 Response로 저장
      const buf = await file.arrayBuffer();
      await cache.put(cacheKey, new Response(buf, {
        headers: {
          'Content-Type':  file.type || 'application/octet-stream',
          'X-File-Name':   encodeURIComponent(file.name || `media_${i}`),
          'X-File-Size':   String(file.size || buf.byteLength),
        }
      }));

      meta.push({
        cacheKey,
        type: file.type || 'application/octet-stream',
        name: file.name || `media_${i}`,
      });
    }

    // 메타데이터 저장
    await cache.put('/lovelog/shared-meta', new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' }
    }));

    // ✅ 완료 플래그 — 앱이 폴링으로 대기할 수 있도록
    await cache.put('/lovelog/shared-ready', new Response('1', {
      headers: { 'Content-Type': 'text/plain' }
    }));

  } catch (e) {
    console.error('[SW] saveSharedFiles error:', e);
  }
}
