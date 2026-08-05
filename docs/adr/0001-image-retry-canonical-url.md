# Image retry warms Canonical URL (no cache-bust query)

Manual image retry used `?r=N` to bypass short CDN negative caches. A success on that URL left `/api/image/{id}` cold (missed cache opportunity) and stored extra immutable variants (key fragmentation). **Decision:** Same-URL Retry only — client always requests the Canonical Image URL; Reload Generation remounts `<img>` without changing `src`. **Negative cache is status-split (H1):** 200 immutable on canonical; 404 keeps ~60s CDN steady-miss cache; 502/504 and other transient upstream failures use `no-store` (accept stampede; rely on regional rate limit); upstream 429/403 keep short CDN `s-maxage≈10`; browser non-200 is `no-store`. Out of scope this change: automatic retry, 404-specific UI, query normalization/punishment, JSON route retries.

## Considered options

- **Cache-bust retry (`?r=`)** — rejected as success path: warms the wrong key.
- **Two-phase bust-then-canonical / fetch+blob** — rejected: complexity; risk of not writing browser cache for canonical.
- **CDN key normalization / redirect** — rejected this round (YAGNI; platform-fragile).
- **Keep ~10s negative cache on all errors** — rejected: blocks Same-URL Retry for transients.

## Consequences

- Transient outages can amplify Edge/upstream traffic until rate limit trips.
- 404 within CDN TTL may still look like a “dead” retry button (accepted; `<img>` has no status).
- Historical `?r=` CDN entries are not purged.
