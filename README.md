# AnimeManager — MongoDB Edition

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21.1-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-6.x-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Vite](https://img.shields.io/badge/Vite-5.4.10-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?logo=vercel&logoColor=white)](https://animemanager-mongodb.vercel.app)

> A private-first, cloud-native personal media catalog and tracking engine for **Anime**, **Manga**, and **Manhwa**, built with **MongoDB Atlas**, **Express 4**, **React 18**, and a hardened three-role access control hierarchy.

- **Live Application:** [https://animemanager-mongodb.vercel.app](https://animemanager-mongodb.vercel.app)
- **GitHub Repository:** [https://github.com/ragnarStark79/AnimeManager-MongoDB](https://github.com/ragnarStark79/AnimeManager-MongoDB)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Frontend-to-Backend Request Flow](#frontend-to-backend-request-flow)
- [API Request Lifecycle](#api-request-lifecycle)
- [MongoDB & NoSQL Design](#mongodb--nosql-design)
  - [Document Model & Identifier Strategy](#document-model--identifier-strategy)
  - [Embedded vs. Referenced Data](#embedded-vs-referenced-data)
  - [Logical Data Model Diagram](#logical-data-model-diagram)
  - [Collection Summary](#collection-summary)
  - [Indexing and Data Integrity](#indexing-and-data-integrity)
- [Authentication, Authorization & Security](#authentication-authorization--security)
  - [Three-Role Hierarchy](#three-role-hierarchy)
  - [Cryptographic Foundations](#cryptographic-foundations)
  - [Session Management & CSRF Defense](#session-management--csrf-defense)
  - [Privacy-Preserving Auditing](#privacy-preserving-auditing)
- [Core Application Workflows](#core-application-workflows)
  - [Authentication & Access Flow](#authentication--access-flow)
  - [Personal Library & Tracking Workflow](#personal-library--tracking-workflow)
  - [External Metadata Import Workflow](#external-metadata-import-workflow)
  - [Testing & Verification Workflow](#testing--verification-workflow)
- [Repository Structure](#repository-structure)
- [API Overview](#api-overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Commands & Scripts Reference](#commands--scripts-reference)
- [Testing & Verification Strategy](#testing--verification-strategy)
- [Operational Reliability & Hosting Notes](#operational-reliability--hosting-notes)
- [Contributing](#contributing)
  - [Individual Contributors](#individual-contributors)
  - [Team Contributions](#team-contributions)
  - [Contribution Safety Rules](#contribution-safety-rules)
- [Known Limitations & Future Improvements](#known-limitations--future-improvements)
- [Documentation Links](#documentation-links)
- [License & Project Status](#license--project-status)

---

## Overview

AnimeManager is an engineered personal media manager designed to solve the data fragmentation, privacy loss, and rigid categorization common to mainstream commercial tracking platforms. It operates as a self-hosted or cloud-deployed personal digital ledger where users maintain complete sovereignty over their media catalog, reading/watching milestones, and custom curated playlists.

A fundamental design principle of AnimeManager is the **strict architectural separation** between:
1. **My List (Collections):** User-defined thematic collections and custom folders (e.g., *"Cyberpunk Dystopias"*, *"Top 10 Shonen"*, *"Winter 2026 Watchlist"*). A media title can belong to multiple collections or none at all.
2. **Bookmarks (Progress Tracking):** The user's temporal and evaluative engagement with a specific title (`status`, `progress`, `progressTotal`, `personalRating`, `priority`, `notes`). A title has at most one bookmark per user.

Modifying, reordering, or deleting a collection never affects reading/watching progress. Conversely, logging episode progress or deleting a bookmark never removes a title from user collections.

---

## Key Features

- **Multi-Format Media Catalog:** Native cataloging for Anime, Manga, and Manhwa with localized titles, original scripts (kanji, kana, hangul), romanized aliases, synopsis, background notes, publication years, episode/chapter counts, and genre tagging.
- **Independent Consumption Tracking (Bookmarks):** Granular episode and chapter progress tracking, standardized status lifecycle (`plan_to_watch` $\rightarrow$ `watching` $\rightarrow$ `completed`, plus `on_hold` and `dropped`), 1–10 personal rating scale, priority levels, and private notes.
- **Thematic Playlist Curation (My List):** Named collections with custom descriptions, color badges, icons, and manual title reordering via positional array indices.
- **External Metadata Gateway (Tenrai / Jikan v4):** Direct search against MyAnimeList catalog candidates via the Tenrai v1 API (`https://api.tenrai.org/v1`), featuring read-only candidate preview, duplicate detection, and atomic transactional commits.
- **Resilient Offline / Decoupled Operation:** Upstream metadata availability is completely decoupled from core library management. Manual title entry, bookmark tracking, and collection curation remain 100% operational even if external APIs experience downtime.
- **Three-Role Administrative Hierarchy:** Role-specific application experiences separating ordinary `user` library accounts, operational `superadmin` supervision portals, and infrastructure `root_admin` governance dashboards.
- **Privacy-Preserving Audit Logging:** Automated operational and security audit trails that log event types and media categories while strictly scrubbing user title names, reading habits, ratings, and passwords.
- **Full Data Portability:** On-demand streaming exports of the user's entire library as relational JSON or tabular RFC 4180 CSV files.
- **Flix.id Glassmorphism Interface:** Responsive dark aesthetic with frosted glass containers (`backdrop-filter: blur(16px)`), pulsing ambient light orbs, fluid micro-animations, and viewport adaptation at 768px (sidebar on desktop, bottom navigation on mobile).

---

## Technology Stack

| Layer | Technology | Verified Version | Purpose in Project |
| :--- | :--- | :--- | :--- |
| **Runtime Environment** | Node.js | `>= 20.0.0` (Active: `v26.10.0`) | Backend execution runtime and monorepo workspace orchestration |
| **Language & Typings** | TypeScript | `^5.6.3` | End-to-end static typing across shared contracts, API, and client |
| **Frontend Framework** | React | `^18.3.1` | Declarative UI rendering, hooks, and component lifecycle management |
| **Frontend Build Tool** | Vite | `^5.4.10` | Fast ESM development server and Rollup production bundling |
| **Client Routing** | React Router DOM | `^6.27.0` | Client-side routing, protected navigation, and dynamic parameters |
| **Async State & Cache** | TanStack React Query | `^5.104.3` | Server state caching, background synchronization, and cache invalidation |
| **Icons & UI Primitives**| Lucide React | `^0.454.0` | Accessible vector icons for navigation, status chips, and controls |
| **Backend Framework** | Express | `^4.21.1` | RESTful HTTP routing, middleware pipeline, and response serialization |
| **Database Driver** | MongoDB Node Driver | `^6.21.0` | Official high-performance driver connecting to MongoDB Atlas |
| **Database Platform** | MongoDB Atlas | Cluster 6.x | Cloud document persistence, compound B-tree indexes, replica sets |
| **Validation & Schemas** | Zod | `^3.23.8` | Runtime schema validation for requests, environment, and domain models |
| **Security Middleware** | Helmet & CORS | `^8.0.0` / `^2.8.5` | Security HTTP headers (HSTS, XSS) and strict origin normalization |
| **Cryptography** | Node.js Crypto | Native Built-in | Scrypt password hashing, SHA-256 session token hashing, AES-256-GCM MFA secret encryption |
| **Two-Factor Auth (TOTP)** | otplib & qrcode | `^13.5.0` / `^1.5.4` | RFC 6238 TOTP verification, provisioning URI generation, and QR code rendering |
| **Testing Engine** | Node.js Test Runner | Native (`node --test`)| Built-in test execution runner (230 automated tests, 0 external test runners) |
| **HTTP Test Client** | Supertest | `^7.0.0` | In-memory integration testing against the Express application |
| **Hosting Platform** | Vercel Serverless | Configuration Spec | Global edge static delivery and serverless function delegation |

---

## System Architecture

AnimeManager is architected as an npm workspaces monorepo separating client presentation, serverless routing, domain services, shared validation contracts, and database persistence:

```
[ Web Browser Client ]
        │  HTTPS (JSON / Cookies)
        ▼
[ Vercel Edge Ingestion (vercel.json) ]
        ├─ Static Assets (/assets/*) ──────► Static CDN Edge (apps/web/dist)
        └─ API Calls (/api/:path*)   ──────► Serverless Function (api/index.js)
                                                      │
                                                      ▼
                                       [ Express API (apps/api/dist/app.js) ]
                                         ├── Helmet / CORS / Request-ID
                                         ├── Dual Auth (Cookie / Bearer JWT)
                                         ├── CSRF Origin Guard
                                         ├── Zod Request Validation
                                         └── Domain Controllers & Services
                                                      │
                                  ┌───────────────────┴───────────────────┐
                                  ▼                                       ▼
                    [ MongoDB Atlas Cluster ]               [ Tenrai v1 Metadata API ]
                    (10 Document Collections)               (Rate-Limited Catalog Gateway)
```

### Overall System Architecture Diagram

```mermaid
flowchart TB
    subgraph ClientWorkspace["Frontend Client (apps/web)"]
        BrowserUI["React 18 SPA (Vite)"]
        QueryCache["TanStack Query Cache"]
        ApiClient["ApiClient Engine (api-client.ts)"]
        BrowserUI <--> QueryCache
        QueryCache <--> ApiClient
    end

    subgraph EdgeBoundary["Edge Routing (Vercel)"]
        EdgeRouter["Vercel Edge Router"]
        StaticEdge["Static Edge CDN (apps/web/dist)"]
        ServerlessBridge["Serverless Wrapper (api/index.js)"]
        
        ApiClient -->|HTTPS + ambient cookie| EdgeRouter
        EdgeRouter -->|Static Requests| StaticEdge
        EdgeRouter -->|/api/v1/*| ServerlessBridge
    end

    subgraph BackendWorkspace["Backend API (apps/api)"]
        ExpressApp["Express Application (app.ts)"]
        MiddlewarePipe["Middleware Pipeline (Auth, CSRF, Zod)"]
        Controllers["Domain Controllers (Titles, Bookmarks, Admin)"]
        Services["Domain Services (Library, Curation, Import)"]
        Repositories["MongoDB Repositories (Data Access Layer)"]
        
        ServerlessBridge --> ExpressApp
        ExpressApp --> MiddlewarePipe
        MiddlewarePipe --> Controllers
        Controllers --> Services
        Services --> Repositories
    end

    subgraph SharedWorkspace["Shared Contracts (packages/shared)"]
        SharedSchemas["Zod Validation Schemas"]
        SharedTypes["TypeScript Domain Types"]
        SharedSchemas -. Validates .-> MiddlewarePipe
        SharedTypes -. Types .-> ClientWorkspace
        SharedTypes -. Types .-> BackendWorkspace
    end

    subgraph CloudPersistence["Persistence & External Services"]
        AtlasDB[("MongoDB Atlas Cloud Database\n(Cluster0 / M0 Replica Set)")]
        TenraiGateway["Tenrai v1 API\n(MyAnimeList Catalog Proxy)"]
        
        Repositories -->|TLS Pooled Connections| AtlasDB
        Services -->|Rate-Limited HTTPS| TenraiGateway
    end
```

---

## Frontend-to-Backend Request Flow

The following sequence models a typical authenticated interaction—such as listing media titles in the user's catalog:

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Page as React Page (TitlesPage)
    participant Query as TanStack React Query
    participant Client as ApiClient (api-client.ts)
    participant Express as Express API (/api/v1/titles)
    participant Auth as Auth Middleware
    participant Repo as Titles Repository
    participant Mongo as MongoDB Atlas

    User->>Page: Navigates to Titles catalog
    Page->>Query: useQuery(['titles', filterState])
    alt Cache Hit (Data Fresh)
        Query-->>Page: Return cached titles
    else Cache Miss / Stale
        Query->>Client: api.titles.list(filters)
        Client->>Express: GET /api/v1/titles?mediaType=anime (Credentials: Include)
        Note over Client,Express: Browser sends HttpOnly 'animemanager_session' cookie
        Express->>Auth: Extract cookie & verify SHA-256 session token hash
        Auth->>Mongo: user_sessions.findOne({ sessionTokenHash, expiresAt: { $gt: now } })
        Mongo-->>Auth: Valid Session Document (userId)
        Auth-->>Express: Bind req.user = { id: userId, role: 'user' }
        Express->>Repo: titlesRepository.list(ownerId, filters)
        Repo->>Mongo: titles.find({ ownerId, mediaType: 'anime' }).sort({ createdAt: -1 })
        Mongo-->>Repo: Document Cursor Array
        Repo-->>Express: TitleDocument[]
        Express-->>Client: HTTP 200 { data: [...], meta: { total, limit, offset } }
        Client-->>Query: Parsed Titles Array
        Query->>Query: Update Cache
        Query-->>Page: Render Media Grid
    end
    Page-->>User: Displays Poster Cards with Ambient Lighting
```

---

## API Request Lifecycle

Every HTTP request traverses a structured, fail-safe middleware pipeline before reaching domain business logic:

```mermaid
flowchart TD
    Req([Incoming HTTP Request]) --> Helmet[Helmet Security Headers]
    Helmet --> Cors[CORS Origin Normalization]
    Cors --> BodyLimit[express.json Payload Ceiling 1MB]
    BodyLimit --> ReqId[Generate / Bind X-Request-ID]
    
    ReqId --> RouteMatch{Route Registered?}
    RouteMatch -- No --> Err404[Throw NotFoundError 404]
    
    RouteMatch -- Yes --> AuthCheck{Protected Endpoint?}
    AuthCheck -- No --> Controller[Execute Controller Handler]
    
    AuthCheck -- Yes --> CookieInspect{Session Cookie Present?}
    CookieInspect -- Yes --> HashLookup[SHA-256 Lookup in Database Sessions]
    CookieInspect -- No --> BearerInspect{Bearer JWT Header Present?}
    
    BearerInspect -- No --> Err401[Throw UnauthorizedError 401]
    BearerInspect -- Yes --> VerifyJwt[jwt.verify HS256 Token Claims]
    
    HashLookup --> StatusCheck{Account Status Active?}
    VerifyJwt --> StatusCheck
    
    StatusCheck -- No --> Err401
    StatusCheck -- Yes --> CsrfGuard{Mutating Method POST/PUT/PATCH/DELETE?}
    
    CsrfGuard -- Yes --> OriginCheck{Origin Matches CORS_ORIGIN?}
    OriginCheck -- No --> Err403Csrf[Throw ForbiddenError 403 CSRF]
    OriginCheck -- Yes --> RoleGuard{Requires Admin Privilege?}
    CsrfGuard -- No --> RoleGuard
    
    RoleGuard -- Yes --> RoleMatch{Role Satisfies Endpoint Guard?}
    RoleMatch -- No --> Err403Role[Throw ForbiddenError 403 Role]
    RoleMatch -- Yes --> SchemaValidation{Zod Schema Valid?}
    RoleGuard -- No --> SchemaValidation
    
    SchemaValidation -- No --> Err422[Throw ValidationError 422]
    SchemaValidation -- Yes --> Controller
    
    Controller --> Service[Domain Service Execution]
    Service --> MongoOp[MongoDB Atlas Read/Write]
    MongoOp --> AuditCheck{Requires Audit Log?}
    AuditCheck -- Yes --> WriteAudit[Record Scrubbed audit_log]
    AuditCheck -- No --> SendResp([Send HTTP 200/201 JSON Envelope])
    WriteAudit --> SendResp
    
    Err404 --> CentralError[Centralized Error Handler]
    Err401 --> CentralError
    Err403Csrf --> CentralError
    Err403Role --> CentralError
    Err422 --> CentralError
    CentralError --> ErrorResp([Send Normalized Error Envelope])
```

---

## MongoDB & NoSQL Design

MongoDB is the principal storage engine for AnimeManager. Media catalogs exhibit polymorphic and deeply nested structures—such as variable episode/chapter metrics, localized Japanese/Korean aliases, multi-genre classifications, and external streaming cross-references. Document NoSQL models these structures naturally without sparse relational tables or expensive multi-table joins.

### Document Model & Identifier Strategy

- **BSON Document Storage:** Rich metadata is serialized into BSON documents, allowing embedded sub-arrays to be retrieved in a single read operation.
- **Canonical UUID v4 Identifiers:** All document `_id` fields use 122-bit cryptographically secure UUID v4 strings (e.g., `3c4a5238-a017-4c7a-a3f3-06312fa1ddc1`) rather than default 12-byte BSON `ObjectId`s. This guarantees deterministic client-side generation, language-neutral interoperability, and protection against sequential enumeration attacks.
- **Application-Level Schema Enforcement:** While MongoDB storage is schema-flexible, data integrity is strictly enforced at runtime by **Zod schemas** in `@animemanager/shared`, guaranteeing that malformed data is rejected before reaching the database.

### Embedded vs. Referenced Data

| Entity Relationship | Storage Strategy | Architectural Justification |
| :--- | :--- | :--- |
| **Title $\rightarrow$ Aliases, Genres, Tags, Sources** | **Embedded Subdocuments** | 1-to-few relationship; always displayed together with the title. Eliminates 4 relational `JOIN` operations per query. |
| **Collection $\rightarrow$ Collection Items** | **Embedded Subdocuments** | Embedded array (`items: [{ titleId, position, addedAt }]`) allows atomic reordering and position updates in a single document write. |
| **User $\rightarrow$ Titles** | **Referenced Collection** (`ownerId`) | A single user may own thousands of titles. Referencing prevents hitting MongoDB's 16MB document size limit and avoids severe write amplification. |
| **Title $\rightarrow$ Bookmark** | **Referenced Collection** (`titleId`) | Maintains strict domain separation between collections and tracking. Allows fast querying of bookmarks across statuses without loading heavy title synopses. |

### Logical Data Model Diagram

```mermaid
flowchart TD
    subgraph IdentityDomain["Identity & Access Domain"]
        Users["users\n(_id: UUID, email, username, role='user', status)"]
        UserSessions["user_sessions\n(_id: UUID, userId: UUID, sessionTokenHash, expiresAt)"]
        
        SuperAdmins["super_admins\n(_id: UUID, email, username, role='superadmin', status)"]
        SuperSessions["super_admin_sessions\n(_id: UUID, adminId: UUID, sessionTokenHash, expiresAt)"]
        
        RootAdmins["root_admins\n(_id: UUID, email, username, role='root_admin', status)"]
        RootSessions["root_admin_sessions\n(_id: UUID, rootAdminId: UUID, sessionTokenHash, expiresAt)"]
        
        Users -->|1 : N Sessions| UserSessions
        SuperAdmins -->|1 : N Sessions| SuperSessions
        RootAdmins -->|1 : N Sessions| RootSessions
    end

    subgraph LibraryDomain["User Personal Library Domain (Owner-Isolated)"]
        Titles["titles\n(_id: UUID, ownerId: UUID, englishTitle, mediaType)\n[Embeds: aliases, genres, tags, externalSources]"]
        Bookmarks["bookmarks\n(_id: UUID, ownerId: UUID, titleId: UUID, status, progress, rating)"]
        Collections["collections\n(_id: UUID, ownerId: UUID, name, normalizedName)\n[Embeds: items: [{ titleId: UUID, position, addedAt }]]"]
        
        Users -.->|Owns N Titles| Titles
        Users -.->|Owns N Bookmarks| Bookmarks
        Users -.->|Owns N Collections| Collections
        
        Bookmarks -.->|References titleId (1 : 1 per owner)| Titles
        Collections -.->|Embedded items reference titleId (N : M)| Titles
    end

    subgraph AuditDomain["Governance Domain"]
        AuditLogs["audit_logs\n(_id: UUID, eventType, actorId, actorRole, targetId, outcome, metadata)"]
        
        Users -.->|Generates user activity events| AuditLogs
        SuperAdmins -.->|Generates administrative events| AuditLogs
        RootAdmins -.->|Generates governance events| AuditLogs
    end
```

### Collection Summary

The database schema consists of exactly **11 collections**:

| Collection | Purpose | Important Design Notes |
| :--- | :--- | :--- |
| **`titles`** | Personal media catalog items (anime, manga, manhwa) | Scoped to `ownerId`. Embeds aliases, genres, tags, and external sources. |
| **`collections`** | User-created playlists and thematic folders | Scoped to `ownerId`. Unique normalized name per owner. Embeds title item positions. |
| **`bookmarks`** | Temporal consumption milestones and personal ratings | Scoped to `ownerId`. Enforces unique `{ ownerId, titleId }` index (1 bookmark per title). |
| **`users`** | Self-registered ordinary user accounts | Unique lowercase email and username. Scrypt password hashes. |
| **`user_sessions`** | Active session tokens for ordinary users | Stores 64-char SHA-256 token hashes. 7-day TTL expiration index. |
| **`super_admins`** | Operational administrator accounts | Governed by Root Admins. Unique email/username indexes. Scrypt hashes. |
| **`super_admin_sessions`** | Active session tokens for Super Administrators | Stores SHA-256 token hashes. Indexed by `adminId` for mass revocation. |
| **`root_admins`** | Infrastructure owner account | Created via CLI bootstrap. Governs Super Admins and views system audits. |
| **`root_admin_sessions`** | Active session tokens for Root Administrators | Stores SHA-256 token hashes. Expiration-indexed. |
| **`account_mfa`** | Two-step verification (TOTP) configuration & recovery codes | Scoped to `{ accountId, accountRole }`. AES-256-GCM encrypted secrets, SHA-256 recovery hashes. |
| **`audit_logs`** | Immutable operational and security audit ledger | Append-only. Indexed by timestamp, actor, and event type. Privacy-scrubbed. |

### Indexing and Data Integrity

The application provisions **30 targeted indexes** across all 11 collections via `scripts/init-indexes.js` and `apps/api/src/repositories/mongo.ts`:
- **Equality, Sort, Range (ESR) Compound Indexes:** Indexes such as `{ ownerId: 1, mediaType: 1, createdAt: -1 }` on `titles` satisfy tenant isolation (`ownerId`), category filtering (`mediaType`), and chronological ordering (`createdAt`) directly in B-tree leaf nodes without memory sorts.
- **Unique Constraints:** Unconditionally enforced on `uq_users_email`, `uq_users_username`, `uq_collections_owner_normalized_name`, and `uq_bookmarks_owner_title`.
- **Partial Filter Indexes:** `uq_titles_owner_provider_external_id` enforces uniqueness across `{ ownerId: 1, 'externalSources.provider': 1, 'externalSources.externalId': 1 }` with `partialFilterExpression: { 'externalSources.externalId': { $exists: true } }`. Manual entries without external IDs do not consume index space.
- **Multikey Array Indexing:** `idx_collections_items_title_id` indexes each element of the embedded `items` array, enabling $O(\log N)$ reverse-lookups when deleting or auditing titles.
- **Serverless Connection Management:** In serverless execution environments (`VERCEL=1`), connection pools are tuned to `maxPoolSize: 3`, `minPoolSize: 0`, and `maxIdleTimeMS: 10000` to prevent connection starvation on cloud clusters.

---

## Authentication, Authorization & Security

### Three-Role Hierarchy

AnimeManager implements three distinct account roles with strictly enforced boundaries:

```
[ Root Administrator (root_admin) ]
  ├── Manages Super Administrators (Create, Disable, Revoke Sessions, Delete)
  ├── Inspects Full System Audit Logs & Real-Time Cloud Statistics
  └── Accesses /administrator Portal (Strictly prohibited from owning personal titles)

[ Super Administrator (superadmin) ]
  ├── Supervises Ordinary Users (Activate, Restrict, Disable, Revoke Sessions, Delete)
  ├── Inspects Privacy-Safe User Activity Streams
  └── Accesses /superadmin Portal (Strictly prohibited from modifying Super Admins)

[ Ordinary User (user) ]
  ├── Manages Personal Media Catalog, Bookmarks, and Custom Collections
  ├── Exports Personal Library (JSON / CSV)
  └── Accesses / Client Dashboard (Strictly isolated from administrative portals)
```

### Cryptographic Foundations

- **Scrypt Password Hashing:** Plaintext passwords are never saved. Hashes are generated via Node.js native `crypto.scrypt` using a cryptographically secure 16-byte random salt and 64-byte derived key length (`scrypt$v1$<saltHex>$<derivedKeyHex>`). Verification uses constant-time comparison (`crypto.timingSafeEqual`) to eliminate timing attacks.
- **Opaque SHA-256 Session Tokens:** Session tokens are high-entropy 256-bit random values (32 bytes hex). The raw token is dispatched to the client; only the **SHA-256 hash** is saved in MongoDB. A database leak does not expose active session tokens.

### Session Management & CSRF Defense

- **`HttpOnly` Session Cookies:** Ambient authentication uses the `animemanager_session` cookie configured with `httpOnly: true` (neutralizes XSS token theft), `sameSite: 'lax'` (CSRF protection), `path: '/'`, and `secure: true` in production (enforcing HTTPS).
- **CSRF Origin Verification:** Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated via ambient session cookies must pass `isAllowedOrigin(req)`, which validates the `Origin` or `Referer` header against the whitelisted `CORS_ORIGIN`. Cross-origin mutations are rejected with HTTP 403.
- **Brute-Force Rate Limiting:** `loginRateLimitMiddleware` enforces a sliding memory window of 15 minutes. Exceeding 5 failed login attempts from a client IP triggers a rate-limit lockout (HTTP 429).
- **Multi-Tenant Data Isolation:** Every title, bookmark, and collection query unconditionally binds `{ ownerId: req.user.id }`. If a client injects a spoofed `ownerId` in the request body, the server completely ignores it and overwrites it with the authenticated session identity. Cross-user access returns HTTP 404.

### Two-Step Verification (TOTP RFC 6238)

AnimeManager supports authenticator-app-based two-step verification across all three roles (`user`, `superadmin`, and `root_admin`):

- **Standards-Compliant TOTP:** Implements standard RFC 6238 Time-Based One-Time Passwords (SHA-1 HMAC, 30-second period, 6-digit output) with a tightly bounded clock-skew window (±1 step / 30 seconds). Fully compatible with standard authenticator apps including Google Authenticator, Microsoft Authenticator, 2FAS, Bitwarden, and 1Password.
- **Authenticated Encryption at Rest (AES-256-GCM):** Active and pending TOTP secrets are encrypted before persistence in MongoDB using AES-256-GCM with a server-only key (`MFA_ENCRYPTION_KEY`). Nonces (12-byte IV) are randomly generated per encryption, and authentication tags (16-byte) prevent ciphertext tampering (`gcm$v1$<ivHex>$<tagHex>$<ciphertextHex>`). Plaintext secrets are never stored or logged.
- **Atomic Replay Protection:** Verification tracks the RFC 6238 `lastUsedTimeStep` in MongoDB. Replayed OTP codes submitted within the same 30-second window are rejected, and concurrent race attempts cannot bypass verification.
- **Single-Use Emergency Recovery Codes:** Upon enrollment, users receive 8 single-use recovery codes (`XXXXX-XXXXX`). Codes are stored only as SHA-256 hashes in MongoDB. When redeemed during login, codes are atomically consumed via `$pull`, preventing reuse. Users can regenerate recovery codes at any time after password and OTP confirmation.
- **Two-Step Login Challenge:** Accounts with MFA enabled cannot obtain a session cookie with password verification alone. Instead, the server issues a signed, short-lived (5-minute) MFA challenge token (`type: 'mfa_challenge'`). The ambient `HttpOnly` session cookie is established only after validating the challenge token alongside a valid TOTP or recovery code. Challenge tokens cannot be used as Bearer tokens for API endpoints.
- **Sensitive Action Safeguards:** Initiating enrollment, verifying setup, disabling 2FA, and regenerating recovery codes strictly require account password confirmation.
- **Audit & Privacy Scrubbing:** Audit events record operational actions (`mfa_enrolled`, `mfa_challenge_created`, `mfa_disabled`, etc.) while strictly omitting OTP codes, secret keys, QR payloads, and recovery codes.

### Privacy-Preserving Auditing

Audit events logged to `audit_logs` enforce strict privacy scrubbing:
- **Recorded:** Timestamps, actor ID, actor role, action category, target ID, target type, outcome, and general media type (`anime|manga|manhwa`).
- **Permanently Excluded:** Media title names, synopsis text, personal review notes, numeric ratings, passwords, password hashes, and session tokens are never saved to audit metadata.

---

## Core Application Workflows

### Authentication & Access Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant API as Express API (/api/v1/auth/login)
    participant RateLimit as Login Rate Limiter
    participant PassUtil as Crypto Utilities (scrypt / SHA-256)
    participant Users as Users Collection
    participant Sessions as User Sessions Collection

    User->>API: POST /api/v1/auth/login { email, password }
    API->>RateLimit: Verify IP failed attempts < 5 in 15min
    RateLimit-->>API: Rate Limit Permitted
    API->>Users: findOne({ email: email.toLowerCase() })
    Users-->>API: UserDocument (with passwordHash)
    API->>PassUtil: verifyPassword(password, user.passwordHash)
    PassUtil-->>API: Boolean (Constant-Time Match)
    alt Invalid Password
        API->>RateLimit: recordFailedLogin(ip)
        API-->>User: HTTP 401 UNAUTHORIZED (Generic Credentials Error)
    else Password Verified
        API->>RateLimit: recordSuccessfulLogin(ip)
        API->>PassUtil: generateSessionToken() (256-bit random)
        PassUtil-->>API: rawToken (64 hex characters)
        API->>PassUtil: hashSessionToken(rawToken) -> tokenHash
        API->>Sessions: insertOne({ userId, sessionTokenHash: tokenHash, expiresAt: +7d })
        API-->>User: HTTP 200 OK + Set-Cookie: animemanager_session (HttpOnly; SameSite=Lax)
    end
```

### Personal Library & Tracking Workflow

```mermaid
flowchart TD
    User([Authenticated User]) --> ActionSelect{Select Library Action}
    
    ActionSelect -->|Catalog Browsing| BrowseCatalog[Filter Titles by Media Type, Query, Sort]
    ActionSelect -->|Manual Entry| CreateTitle[POST /api/v1/titles { englishTitle, mediaType }]
    ActionSelect -->|External Search| ImportGateway[Search Upstream Tenrai/Jikan Catalog]
    
    CreateTitle --> InsertTitle[(titles.insertOne with ownerId)]
    ImportGateway --> CommitImport[POST /api/v1/import/commit]
    CommitImport --> InsertTitle
    
    InsertTitle --> OpenDetail[Open Title Detail View]
    BrowseCatalog --> OpenDetail
    
    OpenDetail --> TrackingAction{Update Progress or Collection?}
    
    TrackingAction -->|Log Progress| PutBookmark[PUT /api/v1/titles/:id/bookmark]
    PutBookmark --> UpsertBookmark[(bookmarks.findOneAndUpdate with ownerId, titleId)]
    
    TrackingAction -->|Organize Collection| PostCollItem[POST /api/v1/collections/:id/titles]
    PostCollItem --> PushCollItem[(collections.updateOne $push: items)]
    
    UpsertBookmark --> LibraryReady([Personal Library Updated & Persisted])
    PushCollItem --> LibraryReady
```

### External Metadata Import Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant API as Express API (/api/v1/import/*)
    participant Cache as In-Memory Cache & Throttler
    participant Tenrai as Tenrai v1 API (MyAnimeList Proxy)
    participant Titles as Titles Collection
    participant Bookmarks as Bookmarks Collection

    User->>API: GET /api/v1/import/jikan/search?query=Frieren&type=anime
    API->>Cache: Check in-memory search cache
    alt Cache Miss
        API->>Tenrai: HTTPS GET /v4/anime?q=Frieren (Throttled 350ms)
        Tenrai-->>API: Upstream Candidate List
        API->>Cache: Save in-memory (TTL 5 minutes)
    end
    API-->>User: HTTP 200 [ { mal_id: 52991, title: "Sousou no Frieren", ... } ]

    User->>API: GET /api/v1/import/preview?provider=jikan&externalId=52991&mediaType=anime
    API->>Titles: findOne({ ownerId, 'externalSources.externalId': '52991' })
    Titles-->>API: Duplicate Check Result (isDuplicate: false)
    API-->>User: HTTP 200 { candidate: NormalizedTitle, isDuplicate: false }

    User->>API: POST /api/v1/import/commit { candidate, initialStatus: 'plan_to_watch' }
    API->>Titles: insertOne(NormalizedTitleDocument)
    API->>Bookmarks: insertOne(InitialBookmarkDocument)
    API-->>User: HTTP 201 Created { data: { title, bookmark } }
```

### Testing & Verification Workflow

```mermaid
flowchart LR
    Dev([Developer Working Copy]) --> RunQuality[Execute Static Quality Gates]
    
    subgraph StaticVerification["Phase 1: Code Quality & Contracts"]
        RunQuality --> Typecheck["npm run typecheck\n(tsc --noEmit across all workspaces)"]
        RunQuality --> Lint["npm run lint\n(Zero warnings / Clean pass)"]
        RunQuality --> SharedTests["npm --prefix packages/shared test\n(5 Zod schema boundary tests)"]
    end
    
    StaticVerification --> LocalTesting["Phase 2: Automated Unit & Integration Suites"]
    
    subgraph DynamicVerification["Phase 2: Local & Integration Tests"]
        LocalTesting --> WebTests["npm --prefix apps/web test\n(58 UI, Router, and QA tests)"]
        LocalTesting --> ApiTests["npm --prefix apps/api test\n(155 local API integration tests)"]
    end
    
    DynamicVerification --> CloudTesting["Phase 3: Cloud Atlas & Live Services"]
    
    subgraph CloudVerification["Phase 3: Cloud Verification"]
        CloudTesting --> AtlasSuite["npm run test:atlas\n(18 end-to-end Atlas Cloud tests)"]
        CloudTesting --> MetadataLive["npm run test:tenrai:live\n(Upstream Tenrai reachability)"]
        CloudTesting --> ProdBuild["npm run build\n(Full monorepo production compilation)"]
    end
    
    CloudVerification --> Verified([236 Tests Passing — Deployment Ready])
```

---

## Repository Structure

```text
AnimeManager MongoDB Edition/
├── .env.example                               # Canonical environment variable template
├── .gitignore                                 # Git exclusion rules (ignores .env, MongoEditionDocs)
├── package.json                               # Workspace orchestrator and root scripts
├── tsconfig.base.json                         # Monorepo base TypeScript compiler configuration
├── vercel.json                                # Vercel deployment, build, and route rewrite rules
├── api/                                       # Vercel Serverless Function entry point
│   └── index.js                               # Serverless bridge delegating to apps/api/dist/app.js
├── apps/
│   ├── api/                                   # Backend Express REST API Service
│   │   ├── package.json                       # API dependencies and test runner scripts
│   │   ├── src/
│   │   │   ├── app.ts                         # Express application factory and middleware wiring
│   │   │   ├── server.ts                      # Standalone HTTP server listener (port 4000)
│   │   │   ├── config/index.ts                # Zod-validated environment configuration loader
│   │   │   ├── controllers/                   # HTTP request handlers (admin, auth, titles, etc.)
│   │   │   ├── errors/index.ts                # Centralized AppError hierarchy and HTTP statuses
│   │   │   ├── middleware/                    # Auth, CSRF, Admin, Rate Limit, Validation, Request-ID
│   │   │   ├── repositories/                  # Direct MongoDB data access (mongo.ts, titles, etc.)
│   │   │   ├── routes/                        # Route definitions mapping endpoints to controllers
│   │   │   ├── services/                      # Business logic, title curation, and Jikan import
│   │   │   └── utils/                         # Cryptographic password hashing and cookie utilities
│   │   └── test/                              # 155 unit & integration tests + 18 Atlas cloud tests
│   └── web/                                   # Frontend React 18 Single Page Application
│       ├── package.json                       # Web dependencies and Vite scripts
│       ├── vite.config.ts                     # Vite build configuration and dev proxy (/api -> :4000)
│       ├── src/
│       │   ├── main.tsx                       # React DOM entry point
│       │   ├── app/router.tsx                 # Route declarations (public, user, and admin portals)
│       │   ├── components/layout/             # AppShell, Header, Sidebar, and MobileNav components
│       │   ├── components/ui/                 # Flix.id glassmorphism design system UI library
│       │   ├── lib/                           # ApiClient, AuthContext, and React Query setup
│       │   ├── pages/                         # Routed pages (Titles, Bookmarks, Admin portals, etc.)
│       │   └── styles/                        # CSS design tokens (tokens.css, glassmorphism.css)
│       └── test/                              # 58 frontend router, UI, and QA integration tests
├── packages/
│   └── shared/                                # Shared Domain Contracts
│       ├── package.json                       # Package definition for @animemanager/shared
│       └── src/
│           ├── index.ts                       # Shared exports
│           ├── schemas/index.ts               # Zod validation schemas for all domain entities
│           └── types/index.ts                 # TypeScript interfaces inferred from Zod schemas
├── scripts/                                   # Administrative & Operational Utilities
│   ├── bootstrap-superadmin.js                # CLI utility to provision Root & Super Admins
│   ├── dev.js                                 # Monorepo concurrent development runner
│   ├── healthcheck.js                         # Automated API and database health check script
│   ├── init-indexes.js                        # Multi-collection cloud index provisioning utility
│   └── test-tenrai-live.js                    # Live network reachability test for Tenrai v1 API
├── docs/                                      # Technical Guides & Architecture Documentation
│   ├── LOCAL_DEVELOPMENT.md                   # Step-by-step local development setup guide
│   ├── architecture.md                        # Database schema designs and security boundaries
│   ├── deployment.md                          # Vercel configuration and connection pooling
│   └── api-contracts.md                       # Comprehensive REST API contracts and envelope specs
└── MongoEditionDocs/                          # Internal engineering phase reports (Git-ignored)
```

---

## API Overview

All API routes are served under the `/api/v1` namespace (also aliased to `/v1` for serverless compatibility):

| Functional Area | HTTP Method & Route | Purpose | Access & Roles |
| :--- | :--- | :--- | :--- |
| **System Diagnostics** | `GET /api/v1/health` | Health probe (checks database ping and core collections) | Public |
| | `GET /api/v1/health/liveness` | Fast container liveness check | Public |
| **Authentication & Identity** | `POST /api/v1/auth/register` | Register new ordinary user account | Public |
| | `POST /api/v1/auth/login` | Authenticate credentials; sets session cookie or returns MFA challenge | Public (Rate-Limited) |
| | `GET /api/v1/auth/me` | Inspect active session profile | Authenticated |
| | `POST /api/v1/auth/logout` | Terminate active session; clears cookie | Authenticated |
| | `GET /api/v1/auth/dev-session`| Development-only session generator | Dev-only (Disabled in prod) |
| **Two-Step Verification (MFA)** | `GET /api/v1/auth/mfa/status` | Retrieve current account 2FA status & recovery codes remaining | Authenticated |
| | `POST /api/v1/auth/mfa/setup` | Begin enrollment; returns QR code data URL & manual setup key | Authenticated (Password Required) |
| | `POST /api/v1/auth/mfa/verify-setup` | Confirm 6-digit TOTP code, enable 2FA, and issue 8 recovery codes | Authenticated |
| | `POST /api/v1/auth/mfa/disable` | Securely disable 2FA | Authenticated (Password & OTP) |
| | `POST /api/v1/auth/mfa/recovery-codes/regenerate` | Invalidate existing recovery codes and issue 8 fresh codes | Authenticated (Password & OTP) |
| | `POST /api/v1/auth/mfa/challenge-verify` | Complete login challenge using 6-digit TOTP or recovery code; sets cookie | Public (Rate-Limited) |
| **Media Titles** | `GET /api/v1/titles` | List owner's catalog with pagination, search, and filters | Authenticated (`user`) |
| | `POST /api/v1/titles` | Manually catalog a new media title | Authenticated (`user`) |
| | `GET /api/v1/titles/:id` | Retrieve title details by UUID | Authenticated (`user`) |
| | `PATCH /api/v1/titles/:id` | Update media metadata | Authenticated (`user`) |
| | `DELETE /api/v1/titles/:id` | Delete media title (requires `?confirm=true`) | Authenticated (`user`) |
| **Bookmarks & Progress** | `GET /api/v1/bookmarks` | List bookmarks filtered by status tab | Authenticated (`user`) |
| | `POST /api/v1/bookmarks` | Create standalone bookmark record | Authenticated (`user`) |
| | `PATCH /api/v1/bookmarks/:id` | Update progress, rating, priority, notes | Authenticated (`user`) |
| | `DELETE /api/v1/bookmarks/:id`| Remove bookmark record | Authenticated (`user`) |
| | `PUT /api/v1/titles/:id/bookmark`| Upsert tracking milestone directly by Title UUID | Authenticated (`user`) |
| **Collections (Playlists)** | `GET /api/v1/collections` | List owner's collections | Authenticated (`user`) |
| | `POST /api/v1/collections` | Create new custom collection | Authenticated (`user`) |
| | `GET /api/v1/collections/:id` | Retrieve collection details and item list | Authenticated (`user`) |
| | `PATCH /api/v1/collections/:id` | Update collection metadata | Authenticated (`user`) |
| | `DELETE /api/v1/collections/:id`| Delete collection (underlying titles preserved) | Authenticated (`user`) |
| | `POST /api/v1/collections/:id/titles` | Add titles to collection | Authenticated (`user`) |
| | `DELETE /api/v1/collections/:id/titles/:titleId` | Remove single title from collection | Authenticated (`user`) |
| | `PATCH /api/v1/collections/:id/order` | Reorder title item positions | Authenticated (`user`) |
| **Metadata Import** | `GET /api/v1/import/jikan/search`| Search upstream MyAnimeList catalog candidates | Authenticated (Rate-Limited) |
| | `GET /api/v1/import/preview` | Preview title details & check local duplicate status | Authenticated |
| | `POST /api/v1/import/commit` | Atomically import external candidate into library | Authenticated |
| **Library Export** | `GET /api/v1/export/json` | Stream complete relational library archive as JSON | Authenticated (`user`) |
| | `GET /api/v1/export/csv` | Stream tabular media catalog as RFC 4180 CSV | Authenticated (`user`) |
| **User Administration** | `GET /api/v1/admin/users` | List registered users with account statuses & stats | `superadmin` \| `root_admin` |
| | `GET /api/v1/admin/users/:id` | Inspect detailed user profile | `superadmin` \| `root_admin` |
| | `PATCH /api/v1/admin/users/:id/status` | Update user status (`active`, `restricted`, `disabled`)| `superadmin` \| `root_admin` |
| | `DELETE /api/v1/admin/users/:id` | Delete user and execute cascading cleanup | `superadmin` \| `root_admin` |
| | `POST /api/v1/admin/users/:id/revoke-sessions` | Force-revoke all active sessions for a user | `superadmin` \| `root_admin` |
| | `GET /api/v1/admin/user-activity` | View privacy-safe user activity events | `superadmin` \| `root_admin` |
| **Governance & System** | `GET /api/v1/admin/super-admins`| List all Super Administrator accounts | `root_admin` Only |
| | `POST /api/v1/admin/super-admins` | Provision new Super Administrator account | `root_admin` Only |
| | `PATCH /api/v1/admin/super-admins/:id/status`| Update Super Admin status (`active`, `disabled`) | `root_admin` Only |
| | `DELETE /api/v1/admin/super-admins/:id` | Delete Super Admin account and revoke sessions | `root_admin` Only |
| | `POST /api/v1/admin/super-admins/:id/revoke-sessions`| Force-revoke all sessions for a Super Admin | `root_admin` Only |
| | `GET /api/v1/admin/audit-logs`| Inspect complete system audit ledger with filters | `root_admin` Only |
| | `GET /api/v1/admin/system-stats`| Inspect real-time database counts and memory metrics | `root_admin` Only |

### Standard Response Envelope Format

All API responses are wrapped in a predictable JSON structure:

```json
// Success Response
{
  "data": { ... },
  "meta": {
    "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "timestamp": "2026-10-21T06:00:00.000Z"
  }
}

// Error Response
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "body.mediaType",
        "message": "Invalid enum value. Expected 'anime' | 'manga' | 'manhwa'"
      }
    ]
  },
  "meta": {
    "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "timestamp": "2026-10-21T06:00:00.000Z"
  }
}
```

---

## Prerequisites

Ensure your development environment meets the following specifications:

| Component | Minimum Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (LTS 20+ or 22+ recommended) | `node -v` | Core JavaScript runtime |
| **npm** | `>= 10.0.0` | `npm -v` | Monorepo workspaces manager |
| **MongoDB Atlas** | Active Cluster (M0 Free Tier or higher) | Cloud Atlas Dashboard | Recommended primary database |
| **Local MongoDB** | Optional: `>= 6.0` (`mongod` on port 27017) | `mongod --version` | Supported local development fallback |
| **Git** | `>= 2.30.0` | `git --version` | Version control |

---

## Quick Start

### 1. Clone & Install Dependencies

```bash
git clone git@github.com:ragnarStark79/AnimeManager-MongoDB.git
cd "AnimeManager MongoDB Edition"
npm install
```

### 2. Configure Local Environment

Copy the verified `.env.example` template:

```bash
cp .env.example .env
```

Edit `.env` with your MongoDB connection string and a secure JWT secret:

```env
# Server Runtime
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Authentication & Two-Step Verification
JWT_SECRET=development-jwt-secret-min-16-chars-long!
MFA_ENCRYPTION_KEY=development-mfa-encryption-key-32b-min!
ENABLE_DEV_AUTH=true

# MongoDB Configuration (Atlas or Local)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=animemanager

# Frontend Configuration
VITE_API_BASE_URL=/api/v1
VITE_APP_TITLE=AnimeManager
```

> [!IMPORTANT]
> `.env` files contain sensitive credentials and must **never** be committed to version control. They are strictly excluded by `.gitignore`.

### 3. Build Shared Contracts

Before starting development servers, compile `@animemanager/shared` so TypeScript types and Zod schemas are available:

```bash
npm --prefix packages/shared run build
```

### 4. Start Development Servers

Start the Express API (port 4000) and Vite frontend (port 5173) concurrently with hot-reloading:

```bash
npm run dev
```

- **Frontend Client:** [http://localhost:5173](http://localhost:5173)
- **API Health Check:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

### 5. Verify Local Health

In a separate terminal, confirm database connectivity and API liveness:

```bash
npm run healthcheck
```

---

## Environment Variables

| Variable Name | Layer | Required / Optional | Purpose | Safe Example Value |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Server | Optional (default: `development`)| Runtime mode (`development`, `production`, `test`) | `production` |
| `PORT` | Server | Optional (default: `4000`) | Standalone Express HTTP server port | `4000` |
| `MONGODB_URI` | Server | **Required** | MongoDB Atlas or local connection string | `mongodb+srv://user:REDACTED@cluster.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DB_NAME` | Server | **Required in Prod** | Target database name (cannot be test/dev in prod) | `animemanager_production` |
| `CORS_ORIGIN` | Server | **Required in Prod** | Whitelisted origin permitted for credentials | `https://animemanager-mongodb.vercel.app` |
| `JWT_SECRET` | Server | **Required in Prod** | Signing secret for legacy tokens (min 16 chars) | `REDACTED_HIGH_ENTROPY_SECRET_KEY!` |
| `ENABLE_DEV_AUTH` | Server | Optional (default: `false`) | Enables dev token endpoints (rejected in prod) | `false` |
| `METADATA_API_BASE_URL`| Server | Optional (default: Tenrai v1) | Upstream catalog metadata API endpoint | `https://api.tenrai.org/v1` |
| `REQUEST_TIMEOUT_MS`| Server | Optional (default: `10000`) | Timeout for upstream metadata requests (ms) | `10000` |
| `IMPORT_RATE_LIMIT_WINDOW_MS`| Server | Optional (default: `60000`) | Rate limiter window for import calls (ms) | `60000` |
| `IMPORT_RATE_LIMIT_MAX`| Server | Optional (default: `20`) | Maximum import queries per window | `20` |
| `COVER_MAX_BYTES` | Server | Optional (default: `5242880`) | Maximum allowable image upload size (5MB) | `5242880` |
| `VITE_API_BASE_URL` | Client | Optional (default: `/api/v1`) | API prefix bundled into client build | `/api/v1` |
| `VITE_APP_TITLE` | Client | Optional (default: AnimeManager) | Title rendered in document browser tab | `AnimeManager` |

> [!NOTE]
> Only variables prefixed with `VITE_` are exposed to the client-side browser bundle. Database connection URIs, session secrets, and admin passwords remain strictly server-side.

---

## Commands & Scripts Reference

### Development

```bash
# Start backend (:4000) and frontend (:5173) concurrently
npm run dev

# Start backend standalone in watch mode
npm run dev:api

# Start Vite frontend development server standalone
npm run dev:web

# Run automated healthcheck probe against http://localhost:4000/api/v1/health
npm run healthcheck
```

### Build & Quality

```bash
# Compile all workspaces (@animemanager/shared, apps/api, apps/web)
npm run build

# Run TypeScript typechecks across all workspaces without emitting files
npm run typecheck

# Execute linting checks across all workspaces
npm run lint
```

### Testing

```bash
# Run all local test suites (155 API tests, 58 Web tests, 5 Shared tests = 218 tests)
npm test

# Run API unit and integration test suite only
npm run test:api

# Run MongoDB Atlas cloud integration suite (18 live cloud tests)
npm run test:atlas

# Verify upstream metadata catalog reachability (Tenrai v1 API)
npm run test:tenrai:live
```

### Database Operations & Administration

```bash
# Preview the 29 planned database indexes without modifying the database (Dry-Run)
node scripts/init-indexes.js --dry-run

# Provision indexes on an authorized isolated test database
node scripts/init-indexes.js --database animemanager_test --allow-test-target --confirm

# Simulate Super Admin provisioning in dry-run mode (Zero database writes)
node scripts/bootstrap-superadmin.js --database animemanager_test --email admin@test.local --dry-run

# Provision a Super Administrator account on a non-production database
node scripts/bootstrap-superadmin.js --database animemanager_test --email admin@test.local --password "SecurePass!123" --confirm

# Provision a Root Administrator account on a non-production database
node scripts/bootstrap-superadmin.js --database animemanager_test --email root@test.local --password "RootPass!123" --root --confirm
```

> [!WARNING]
> Both `init-indexes.js` and `bootstrap-superadmin.js` include hardcoded security guards that refuse execution against active development or production databases unless executed through authorized, controlled release procedures.

---

## Testing & Verification Strategy

AnimeManager maintains an automated test suite executed via the native **Node.js Test Runner** (`node --test`), delivering high execution speed without heavy third-party testing frameworks.

### Verified Test Suite Breakdown (236 Tests Passing)

1. **Shared Contracts (`packages/shared`, 5 Tests):**
   - Boundary tests for Zod validation schemas (`titleCreateSchema`, `bookmarkCreateSchema`, `collectionCreateSchema`).
2. **Frontend Client (`apps/web`, 58 Tests):**
   - Role-guarded routing (`/register`, `/administrator`, `/superadmin`).
   - Token lifecycle, expiration parsing, and automatic pruning of stale tokens.
   - Design system token consistency, poster card image fallbacks, and modal Escape key dismissal.
   - Catalog search filtering, debouncing, and empty-state rendering.
3. **Backend API Local Runner (`apps/api`, 155 Tests):**
   - Scrypt password hashing and constant-time verification.
   - Three-role authentication, session creation, expiration, and revocation.
   - Multi-tenant library isolation (User A cannot access User B's titles).
   - Rate limiting, CSRF origin verification, and payload size bounds.
   - Database safeguard tests ensuring tests cannot target production databases (`assertSafeTestDatabaseName`).
4. **MongoDB Atlas Cloud Suite (`apps/api`, 18 Tests):**
   - Live replica set connectivity, automated failover resilience, multi-tenant isolation, and privacy-preserving audit logging on a cloud cluster.

### Pre-PR Verification Checklist

Before submitting a Pull Request, verify that all quality gates pass locally:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

---

## Operational Reliability & Hosting Notes

- **Connection Pool Tuning:** The MongoDB client singleton implements connection caching across serverless invocations. In serverless runtime environments (`VERCEL=1`), `maxPoolSize` is capped at 3 with `maxIdleTimeMS: 10000`, preventing cluster socket exhaustion during burst traffic.
- **Fail-Safe Health Probes:** `GET /api/v1/health` pings MongoDB Atlas and confirms core collections. Degraded database states return HTTP 503 without leaking internal connection strings or stack traces.
- **Zero-Downtime Resilience:** Upstream catalog failures from Tenrai/Jikan are handled with circuit-protected fallbacks. Personal library cataloging, bookmark tracking, and collection curation continue operating without interruption.
- **Hosting Architecture:** Deployed on **Vercel** with static assets served via global edge CDN and API routes executed as transient Node.js serverless functions delegating to `apps/api/dist/app.js`.

---

## Contributing

We welcome contributions from individual developers and teams. Follow these structured guidelines to maintain code quality, security, and architectural consistency.

### Individual Contributors

1. **Review Architecture:** Familiarize yourself with the separation between `apps/api`, `apps/web`, and `packages/shared`.
2. **Create a Topic Branch:** Branch off `main` with a clear name (e.g., `feat/manga-chapter-progress` or `fix/collection-reorder-edge-case`).
3. **Implement Changes:** Follow strict TypeScript typing and existing Zod validation patterns.
4. **Add Automated Tests:** Every new endpoint, schema change, or UI component must include corresponding unit or integration tests.
5. **Run Verification Gates:** Ensure `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass with 0 errors.
6. **Submit a Pull Request:** Provide a clear summary of your changes, reference any relevant issues, and include test execution evidence.

### Team Contributions

1. **Interface-First Coordination:** When building features across frontend and backend, agree on shared contracts in `packages/shared/src/schemas/index.ts` before beginning parallel development.
2. **Workspace Boundaries:** Keep PRs focused on specific workspaces to minimize merge conflicts.
3. **Database Changes:** Any proposed schema modification or new query pattern must include an index analysis in `scripts/init-indexes.js` to ensure $O(\log N)$ lookup performance.
4. **Peer Review:** Security-sensitive changes (authentication, CSRF guard, session repositories, or administrative endpoints) require peer review.

### Contribution Safety Rules

- **Never Commit Secrets:** Do not commit `.env`, private keys, MongoDB URIs, or administrator passwords.
- **Maintain Tenant Isolation:** Ensure every database query enforcing user ownership includes `{ ownerId: req.user.id }`. Never rely on client-supplied `ownerId` parameters.
- **Preserve Privacy Invariants:** Never log user media titles, synopsis text, personal notes, or passwords into `audit_logs`.
- **Zero Production Mutations:** Never run test suites, index initialization, or bootstrap scripts against production databases.

---

## Known Limitations & Future Improvements

### Confirmed Technical Limitations

1. **External Catalog Latency:** External metadata search relies on the upstream Tenrai/Jikan proxy. Peak network latency can introduce 500ms–1500ms response times for live searches.
2. **Free-Tier Connection Limits:** MongoDB Atlas M0 clusters enforce a limit of 500 concurrent connections. While connection pooling (`maxPoolSize: 3`) mitigates this in serverless environments, enterprise traffic loads require an M10+ dedicated cluster.
3. **Single-Region Cloud Cluster:** The primary Atlas cluster is hosted in a single cloud region. Cross-continental API requests may experience physical network latency.

### Planned Enhancements

- **Passkeys & WebAuthn (FIDO2):** Biometric and hardware security key authentication (Phase 16.3).
- **Redis Caching Layer:** Integrating an in-memory Redis cache (Upstash) between Vercel and MongoDB Atlas for popular public media catalog lookups.
- **OAuth2 Social Sign-In:** Adding Google and GitHub OAuth identity providers alongside native email/password authentication.

---

## Documentation Links

Additional technical documentation is maintained in the repository:

- [Local Development Guide](./docs/LOCAL_DEVELOPMENT.md) — Comprehensive environment configuration and troubleshooting steps.
- [System Architecture](./docs/architecture.md) — Detailed document schemas, security models, and design trade-offs.
- [API Contracts](./docs/api-contracts.md) — REST endpoint specifications, request payloads, and error taxonomy.
- [Deployment Guide](./docs/deployment.md) — Vercel serverless configuration, connection pooling, and edge routing.
- [Known Limitations](./docs/known-limitations.md) — Detailed analysis of external provider limits and technical constraints.
- [Architecture Decision Records (ADRs)](./docs/decisions.md) — Historical decision log detailing the transition from SQL to MongoDB.

---

## License & Project Status

**Private / Personal Project.** All rights reserved.

AnimeManager MongoDB Edition is an independent, non-commercial software project. It is not affiliated with, endorsed by, or partnered with MyAnimeList, Jikan, or Tenrai.

For questions, architectural inquiries, or contribution permissions, please contact the repository maintainer via [GitHub Issues](https://github.com/ragnarStark79/AnimeManager-MongoDB/issues).
