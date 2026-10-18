# AnimeManager — Known Limitations & Scope Constraints

**Edition:** MongoDB Edition  
**Version:** 2.0  
**Status:** Documented & Verified  

---

## 1. Upstream Metadata Gateway Limitations (Tenrai & Jikan)

1. **Third-Party API Dependency:**
   - Jikan and Tenrai are community-supported REST gateways that parse and normalize public MyAnimeList metadata. They are not official MyAnimeList services.
   - **Mitigation:** The application treats external metadata imports as an enhancement, never a hard dependency. Manual title creation, catalog organization, and progress tracking remain fully functional without external network access.
2. **Rate Limits & Throttling:**
   - Public metadata endpoints enforce rate limits (~3–4 requests/second).
   - **Mitigation:** The backend metadata client implements a process-local `RequestThrottler` (350ms spacing), bounded exponential backoff with `Retry-After` header parsing, and an in-memory `BoundedTtlCache` (10m TTL, 500 entry LRU cap).
3. **Manga vs. Manhwa Classification:**
   - Upstream MyAnimeList taxonomy categorizes Japanese manga, Korean manhwa, and Chinese manhua together under `/manga/`.
   - **Mitigation:** The import normalizer inspects publication type metadata. If ambiguous, the UI requires explicit user confirmation before committing the title to the database.

---

## 2. Media & Image Handling

1. **External Image Availability:**
   - Titles store direct image URLs (from upstream providers or user input). If external CDNs expire or block hotlinking, images may fail to load.
   - **Mitigation:** The frontend `PosterCard` component implements an accessible gradient glassmorphism fallback with media initials and titles when an image fails to load.
2. **Upload Constraints:**
   - Initial cover uploads are limited to 5 MB and raster formats (`image/jpeg`, `image/png`, `image/webp`). SVGs are restricted to avoid client-side script injection vectors.

---

## 3. Database & Hosting Constraints

1. **MongoDB Atlas Network Access:**
   - MongoDB Atlas clusters require IP addresses to be listed in **Network Access**. If the local machine or hosting provider's IP changes, connections will fail with `ETIMEDOUT`.
   - **Mitigation:** Ensure appropriate IP ranges or `0.0.0.0/0` (with strong user credentials) are configured in the Atlas dashboard.
2. **Transaction Support on Replica Sets:**
   - Multi-document ACID transactions (`withOptionalTransaction`) require a MongoDB replica set (provided by default on MongoDB Atlas M0+ clusters). On standalone local MongoDB instances running without a replica set, operations execute as individual atomic collection writes.
3. **Serverless Connection Lifecycle:**
   - When deploying to Vercel Serverless Functions, connections are pooled across function container instances with bounded limits (`maxPoolSize: 3`, `minPoolSize: 0`) to prevent exhausting Atlas connection quotas.

---

## 4. Product Scope & Non-Goals for Version 1

1. **No Community Reviews:** Community reviews are excluded from v1 imports to maintain a lean, private library catalog.
2. **Single-User / Private-First:** Version 1 focuses on personal library cataloging. Public social feeds and multi-user subscriptions are excluded from this release.
3. **No Two-Way Write-Back Sync to MAL:** Imports from MyAnimeList are unidirectional; the application does not write progress back to external MyAnimeList accounts.

---

## 5. Authentication & Single-Owner Operational Model

1. **Pre-Generated Token Bootstrap:**
   - Production mode does not expose public user registration or interactive password login forms.
   - Access is restricted to the application owner via cryptographic HS256 JWT tokens.
   - The owner generates an initial session token via the CLI (`scripts/generate-session-token.js`) using the private `JWT_SECRET` and inputs it into browser storage via the Settings UI.
2. **Token Revocation & Expiration:**
   - Stateless JWT tokens cannot be revoked individually without rotating the global `JWT_SECRET`.
   - Token lifetimes are bounded (default 24h for dev tokens, operator-configurable for production tokens).
   - Multi-user authentication, OAuth providers, and refresh token rotation represent future post-v1 roadmap items.
