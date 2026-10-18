# AnimeManager — Architecture Decision Records (ADRs)

**Document Version:** 1.0  
**Status:** Approved Baseline Decisions for Phase 00 / Phase 01  

---

### ADR-001: Private-First Access Model & Authentication

- **Status:** Approved
- **Context:**
  AnimeManager is a personal media library meant for individual cataloging and tracking. The master prompt requires keeping the site private-first and implementing access controls suitable for public internet deployment.
- **Decision:**
  Use **Supabase Auth** for authentication (email/password with a single permitted owner account). Database tables enforce Row Level Security (RLS) linked to `auth.uid()`. When the Express API connects via a service role key, it authenticates the caller's JWT/session before executing database queries. Public anonymous access is blocked on write and read routes.
- **Consequences:**
  - Prevents unauthorized internet users from viewing or modifying personal collections.
  - Keeps service-role keys restricted to the backend server.
  - Prepares the database for future multi-user support without architectural rewrites.

---

### ADR-002: Monorepo Workspace Structure

- **Status:** Approved
- **Context:**
  The project requires both a React/Vite frontend and an Express/Node backend, alongside shared validation schemas, database migrations, and documentation.
- **Decision:**
  Adopt an **npm workspaces** monorepo layout:
  - `apps/web`: React + Vite + TypeScript frontend.
  - `apps/api`: Express + Node.js + TypeScript backend.
  - `packages/shared`: Shared TypeScript types, Zod schemas, and constants.
  - `supabase/`: Versioned migrations and seed SQL.
  - `docs/`: Persistent project tracking and documentation.
- **Consequences:**
  - Code reuse: Zod schemas and TypeScript interfaces are shared between frontend and backend without duplication.
  - Single lockfile and unified root scripts (`npm run build`, `npm test`, `npm run lint`).
  - Clear separation of backend and frontend boundaries.

---

### ADR-003: Backend Hosting Model & Express Portability

- **Status:** Approved
- **Context:**
  Frontend will deploy to Vercel. The backend requires a compatible hosting model. Serverless functions on Vercel have execution timeouts and potential stateless connection pooling considerations, while dedicated containers (Render, Railway, Fly.io) provide continuous long-running processes.
- **Decision:**
  Build the backend as a standard Express application with clear separation between the HTTP server (`server.ts`) and the Express app configuration (`app.ts`). This allows:
  1. Standard container deployment on platforms like Render or Railway.
  2. Direct packaging as a Vercel Serverless Function using a lightweight handler wrapper if a unified Vercel deployment is desired.
- **Consequences:**
  - Avoids platform lock-in.
  - Works consistently in local development via standard `tsx`/`node`.

---

### ADR-004: Styling Architecture & Glassmorphism Design System

- **Status:** Approved
- **Context:**
  The application requires a stunning visual presentation inspired by the Flix.id reference: cool blue/gray atmosphere, translucent frosted surfaces, rounded cards, and responsive layouts. Web application development guidelines advise using Vanilla CSS for maximum flexibility and control, avoiding Tailwind unless requested.
- **Decision:**
  Implement the design system using **Vanilla CSS with CSS Custom Properties (Design Tokens)**.
  - Central token file (`styles/tokens.css`) defining colors, blur intensities, translucent surfaces, borders, radiuses, and shadows.
  - Responsive grid layouts with container queries and flexbox.
  - Solid/semi-opaque fallbacks for browsers lacking `backdrop-filter` or when reduced motion is preferred (`prefers-reduced-motion`).
- **Consequences:**
  - Zero heavy CSS framework dependencies.
  - Precision control over glassmorphism optical contrast, typography, and animations.
  - Strict compliance with project design instructions.

---

### ADR-005: MAL Manga vs. Manhwa Disambiguation

- **Status:** Approved
- **Context:**
  MyAnimeList classifies both Japanese manga and Korean manhwa under its `/manga/` endpoint. However, AnimeManager requires three distinct media types: `anime`, `manga`, and `manhwa`.
- **Decision:**
  During Jikan metadata import:
  1. Parse MAL manga responses and inspect source type fields (e.g. `type: "Manhwa"` or published country).
  2. If type is explicitly "Manhwa", pre-select `manhwa` in the import preview draft.
  3. If ambiguous, flag a prompt in the interactive import preview for the user to confirm whether the title is `manga` or `manhwa` before saving.
  4. Never silently label all MAL manga entries as manga.
- **Consequences:**
  - Guarantees accuracy for the user's manhwa catalog.
  - User retains full editorial control prior to committing.

---

### ADR-006: Collection Name Uniqueness Policy

- **Status:** Approved
- **Context:**
  Users can create custom collections (e.g. "Favorites", "Romance"). The system needs a defined policy on duplicate or similar names.
- **Decision:**
  Enforce **case-insensitive uniqueness per owner** after trimming whitespace:
  - Database constraint: `UNIQUE (owner_id, lower(name))`.
  - Empty or whitespace-only names are rejected at schema validation.
  - User is given an immediate, actionable error if a duplicate name is attempted.
- **Consequences:**
  - Prevents confusing duplicate folders (e.g. "Romance" and "romance").
  - Clean collection browsing in the UI.

---

### ADR-007: Deletion Semantics & Cascade Rules

- **Status:** Approved
- **Context:**
  Title, collection, and bookmark lifecycles intersect. A clear policy is required for when resources are deleted.
- **Decision:**
  1. **Title Deletion:** Explicit user confirmation dialog. Permanently deletes title and cascades to aliases, tags, collection memberships, external sources, and bookmarks.
  2. **Collection Deletion:** Deletes the collection record and removes entries from `title_collections`. **Does NOT delete the titles themselves**.
  3. **Bookmark Deletion:** Removes tracking status, progress, and rating. **Does NOT delete the title record**.
  4. **Export Prior to Deletion:** UI reminds users of the export feature if performing mass deletions.
- **Consequences:**
  - Independent lifecycles for titles, collections, and bookmarks.
  - Zero accidental title loss when organizing or deleting collections.

---

### ADR-008: Canonical Location of Personal Rating

- **Status:** Approved
- **Context:**
  The technical specification notes that `personal_rating` could reside on `titles` or `bookmarks`.
- **Decision:**
  Store `personal_rating` canonically on the **`bookmarks`** table. The title record stores objective source community metrics (`source_score`, `source_rank`, `source_popularity`), while personal evaluation belongs to the user's tracking bookmark.
- **Consequences:**
  - Clean separation between source catalog metadata and user's personal engagement.
  - When titles are listed, the backend joins with the user's bookmark to display personal rating badges where available.

---

### ADR-009: Jikan Import Scope for Release 1

- **Status:** Approved
- **Context:**
  Jikan v4 provides rich data including titles, synopses, covers, episodes, characters, staff, relations, and user reviews.
- **Decision:**
  - **Included in v1 Import:** English/original/alternate titles, synopsis, background, cover URL, release year, status, episode/chapter counts, source score/rank, genres, tags.
  - **Excluded in v1:** Community user reviews (strictly excluded as per Master Prompt).
  - **On-Demand Only:** Character, staff, and relations data are not imported into the core title record during initial import. They can be fetched on demand on the title detail page if needed.
- **Consequences:**
  - Dramatically faster import times.
  - Less strain on Jikan rate limits.
  - Lean local database footprint.

---

### ADR-010: SSRF Prevention & Safe Import URL Parsing

- **Status:** Approved
- **Context:**
  Allowing users to input URLs for metadata import presents Server-Side Request Forgery (SSRF) risks if the server makes arbitrary outbound HTTP requests.
- **Decision:**
  The server **never** fetches arbitrary user-supplied URLs.
  1. User input is validated against a strict regex allowlist for MyAnimeList URLs (`https://myanimelist.net/anime/:id/...` or `https://myanimelist.net/manga/:id/...`).
  2. The parser extracts the ID and type only.
  3. Outbound HTTP requests are made strictly to predefined Jikan endpoints (`https://api.jikan.moe/v4/...`).
  4. Any non-conforming URL is rejected immediately with HTTP 400.
- **Consequences:**
  - Complete mitigation of SSRF vulnerabilities.
  - Predictable, secure API behavior.

---

### ADR-011: Supabase Role Compatibility in Migration Execution

- **Status:** Approved (Phase 01)
- **Context:**
  Supabase provides built-in roles such as `authenticated` and `anon` upon which RLS policies depend (`TO authenticated`). In standard local PostgreSQL installations used for offline testing, these roles do not exist by default, which causes migration failures during automated testing.
- **Decision:**
  In `20261014000002_security_policies.sql`, check for the existence of `authenticated` and `anon` roles and create them conditionally if missing before applying policies.
- **Consequences:**
  - Migrations apply seamlessly across both hosted Supabase and local PostgreSQL test harnesses.
  - No manual role provisioning is needed for automated testing.

---

### ADR-012: Enforcing Cross-Table Ownership in RLS Policies

- **Status:** Approved (Phase 01)
- **Context:**
  A user could theoretically attempt to link another owner's title to their own collection or create a bookmark referencing a title they do not own.
- **Decision:**
  The RLS `WITH CHECK` and `USING` policies for relationship tables (`title_collections`, `title_tags`, `bookmarks`) explicitly require that `auth.uid()` matches both the collection/bookmark owner and the underlying title's owner.
- **Consequences:**
  - Impossible for any authenticated user to tamper with or reference another user's private media library titles.
  - Strict mathematical guarantees of data isolation even if IDs are leaked or guessed.

---

### ADR-013: Layered Express Architecture with Node pg Connection Pool and Transaction Boundaries

- **Status:** Approved (Phase 02)
- **Context:**
  The backend requires robust, testable, and maintainable data access. Operations like title creation involve inserting a parent title record and multiple child records (`title_aliases`, `title_genres`, `title_tags`) which must commit or fail atomically.
- **Decision:**
  Implement a layered Express architecture (`routes` -> `controllers` -> `services` -> `repositories`). Database connections are pooled using `pg.Pool`. An explicit `db.transaction()` helper checks out a dedicated client, executes `BEGIN`, commits upon success, and executes `ROLLBACK` on any error.
- **Consequences:**
  - Prevents orphaned child records during partial database write failures.
  - Guarantees strict query parameterization across all SQL queries to eliminate SQL injection.
  - Separates HTTP transport concerns from core domain business rules and database queries.

---

### ADR-014: Title Deletion Safety Mechanism via Explicit Confirmation Parameter

- **Status:** Approved (Phase 02)
- **Context:**
  Deleting a title cascades to remove aliases, tags, collection memberships, external source mappings, and bookmark tracking. Accidental calls to `DELETE /api/v1/titles/:id` could result in irreversible loss of user tracking data.
- **Decision:**
  Require an explicit query parameter `?confirm=true` on `DELETE /api/v1/titles/:id`. If the confirmation parameter is omitted or false, the API rejects the request with HTTP 400 Bad Request (`CONFIRMATION_REQUIRED`).
- **Consequences:**
  - Protects users from accidental destructive API calls.
  - Enforces that frontend clients implement a deliberate confirmation step before sending the delete command.

---

### ADR-015: Server-Side Owner Scoping Independent of Client Parameters

- **Status:** Approved (Phase 02)
- **Context:**
  Client requests could maliciously or erroneously include an `owner_id` or attempt to associate entities belonging to different owners.
- **Decision:**
  The server strictly extracts `owner_id` from the cryptographically verified JWT token (`req.user.id`). Any `owner_id` passed in request bodies, query strings, or URL parameters is completely ignored. Furthermore, all relationship mutations (such as adding a title to a collection or creating a bookmark) perform server-side checks ensuring that the caller owns both the parent and target entities.
- **Consequences:**
  - Guarantees complete data privacy and isolation across tenants.
  - Prevents horizontal privilege escalation even if an attacker guesses valid resource UUIDs.

---

### ADR-016: Resilient Jikan v4 Importer with Zero-Trust SSRF Defense, Bounded Caching, and Atomic Commit

- **Status:** Approved (Phase 03)
- **Context:**
  The application needs to import metadata from MyAnimeList via the community-hosted Jikan API v4. Allowing user-supplied URLs poses critical Server-Side Request Forgery (SSRF) risks (such as accessing AWS/GCP metadata endpoints `169.254.169.254`, container loopbacks, or private intranet services). Jikan also enforces rate limits (~3 req/s) and experiences transient HTTP 429/503 errors. Additionally, imported metadata must map to multiple relational tables (`titles`, `title_aliases`, `title_genres`, `title_tags`, `external_sources`, and optional `bookmarks` and `title_collections`) atomically, while preventing duplicate title records and honoring user field selections.
- **Decision:**
  1. **Zero-Trust URL & SSRF Defense:** Never pass user-supplied URLs to HTTP fetch. Parse URLs strictly using WHATWG `URL`, requiring `https:`, exact hostname `myanimelist.net`, default port 443, no user credentials, and matching path regex `^\/(anime|manga)\/(\d+)(?:\/[^\/]+)?\/?$`. Discard query strings and hash fragments. Construct outbound HTTP requests exclusively from the hardcoded base `https://api.jikan.moe/v4/{endpoint}`. Configure fetch with `redirect: 'error'` to prohibit open redirects.
  2. **Upstream Resilience & Bounded Cache:** Implement a serialized `RequestThrottler` to enforce ~3 req/s inter-request spacing. Cache successful responses in `BoundedTtlCache` with 10-minute TTL and 500-entry LRU capacity eviction. Apply bounded exponential backoff (max 3 retries, max delay 10s) with `Retry-After` header parsing strictly to HTTP 429 and 503 responses. Fail immediately on 4xx client errors. Ensure manual title creation is decoupled and operational when Jikan is down.
  3. **Strict Metadata Normalization:** Exclude community reviews entirely. Classify titles as `manhwa` only when upstream metadata explicitly confirms it; flag ambiguous manga titles with `needsMediaConfirmation: true` and an editorial warning.
  4. **Server-Enforced Field Selection & Atomic Commit:** Client drafts are treated as untrusted. The server persists only fields explicitly selected in `selectedFields` or provided in `overrides`. All table inserts occur in a single `db.transaction()`. Duplicate MAL IDs for the same user are detected against `external_sources` and return HTTP 409 `DUPLICATE_IMPORT` with the existing title ID, creating no duplicate records.
- **Consequences:**
  - Total elimination of SSRF attack surfaces.
  - Graceful tolerance of upstream rate limits and transient outages without blocking user catalog management.
  - Atomic database transactions ensure zero partial or corrupted title records.
  - Editorial integrity preserved through user preview and server-side field selection enforcement.

---

### ADR-017: MongoDB Atlas Cloud Architecture & Decoupled JWT Authentication

- **Status:** Approved (Phase 08)
- **Context:**
  The project required migration from Supabase PostgreSQL to MongoDB Atlas to support flexible document schemas, nested metadata arrays without complex join tables, and serverless cloud deployment.
- **Decision:**
  1. Use the official MongoDB Node.js driver (`mongodb >= 6.0`) with connection pooling and multi-document ACID transaction support (`withOptionalTransaction`).
  2. Embed 1:N title relations (`aliases`, `genres`, `tags`, `externalSources`) directly inside `titles` documents, while maintaining `bookmarks` and `collections` as distinct collections referencing title UUIDs.
  3. Decouple authentication from vendor-specific auth providers by implementing standard HS256 JWT verification (`JWT_SECRET`) and maintaining a development session endpoint (`GET /api/v1/auth/dev-session`) strictly gated by `ENABLE_DEV_AUTH=true`.
  4. Automatically size serverless connection pools (`maxPoolSize: 3`, `minPoolSize: 0`, `maxIdleTimeMS: 10000`) when `VERCEL` is detected in the environment.
- **Consequences:**
  - Zero SQL or PostgreSQL runtime dependencies in application packages.
  - Faster document retrieval with natural subdocument embedding.
  - Complete portability across local MongoDB and hosted MongoDB Atlas clusters.



