# AnimeManager — MongoDB Edition

> A private-first personal media catalog and tracking application for Anime, Manga, and Manhwa, powered by **MongoDB Atlas**, **Express**, and **React**.

AnimeManager is designed for personal library management with an atmospheric dark glassmorphism design system. It maintains a strict conceptual separation between **My List** (user-defined thematic collections and folders) and **Bookmarks** (independent reading and watching status, episode/chapter progress, personal ratings, and notes).

---

## Key Features

- **Multi-Format Media Catalog:** Native categorization for Anime, Manga, and Manhwa with rich metadata (English title, original title, romanized/translated aliases, synopsis, background, genres, tags, and release dates).
- **Dual Library Paradigms:**
  - **My List:** Arbitrary, user-defined thematic collections (e.g. *Favorites*, *Current Reading*, *Action & Martial Arts*). One title can belong to multiple collections.
  - **Bookmarks:** Detailed consumption tracking (`plan_to_consume`, `consuming`, `completed`, `on_hold`, `dropped`), episode/chapter progress counters, and 1.0–10.0 ratings completely independent of collection membership.
- **External Metadata Gateway:** Search and import metadata from MyAnimeList via Tenrai v1 / Jikan with read-only preview, duplicate detection, field selection, and atomic transactional commit.
- **Resilient Offline First:** External metadata APIs can experience transient downtime; manual title creation, custom collection management, and tracking remain 100% operational offline.
- **Data Portability:** Stream full library exports as structured JSON or tabular CSV at any time from the authenticated settings page.
- **Dark Glassmorphism Interface:** Bespoke CSS design system featuring frosted translucent cards, subtle cyan/sky accents, fluid micro-animations, and responsive layouts across mobile, tablet, and desktop viewports.

---

## Architecture Overview

AnimeManager is built as an npm monorepo with three modular workspaces:

```text
AnimeManager/
├── apps/
│   ├── web/        # Frontend: React 18, Vite 5, TypeScript, TanStack Query, Vanilla CSS
│   └── api/        # Backend: Node.js, Express, TypeScript, Zod, MongoDB Node Driver
├── packages/
│   └── shared/     # Shared: TypeScript domain interfaces, constants, and Zod validation schemas
├── api/            # Serverless: Vercel serverless function entry point (Express delegate)
└── docs/           # Documentation: System architecture, API contracts, local development guides
```

### Data-Access Layer
- **Driver:** Official MongoDB Node.js driver (`mongodb >= 6.0`).
- **Persistence:** Hosted **MongoDB Atlas** replica set cluster with secondary index optimizations and multi-document ACID transaction support (`withOptionalTransaction`).
- **Embedded Relations:** Titles embed nested aliases, genres, tags, and external sources as subdocument arrays to eliminate complex relational joins.
- **Referential Consistency:** Collections and bookmarks reference canonical title UUIDs with transactional cascades on deletion.

---

## Prerequisites & System Requirements

Before running the application, ensure your environment meets the following specifications:

| Requirement | Minimum Version | Verification |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (Node 20+ LTS or 22+ recommended) | `node -v` |
| **npm** | `>= 10.0.0` | `npm -v` |
| **MongoDB Atlas** | Active cluster (Free Tier M0 or higher) | Cloud Atlas dashboard |
| **Local MongoDB** | Optional: `>= 6.0` (`mongod` on port 27017) | `mongod --version` |

---

## Quickstart & Local Development

### 1. Clone & Install Dependencies
```bash
git clone git@github.com:ragnarStark79/AnimeManager-MongoDB.git
cd AnimeManager-MongoDB
npm install
```

### 2. Configure Environment Variables
Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` with your MongoDB connection details:
```env
# Server Runtime
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Authentication (HS256)
JWT_SECRET=your-jwt-secret-min-16-chars-long!
ENABLE_DEV_AUTH=true

# MongoDB Atlas (Primary Database)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=animemanager

# Frontend
VITE_API_BASE_URL=/api/v1
VITE_APP_TITLE=AnimeManager
```

> [!NOTE]
> **Local MongoDB Alternative:** If you prefer running MongoDB locally for development without cloud network access, set `MONGODB_URI=mongodb://127.0.0.1:27017` and `MONGODB_DB_NAME=animemanager`.

### 3. Start Development Servers
Run frontend and backend concurrently with labeled logs and hot reload:
```bash
npm run dev
```

- **Frontend Application:** [http://localhost:5173](http://localhost:5173)
- **API Health Endpoint:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

### 4. Verify System Health
In a separate terminal, test API responsiveness and database connectivity:
```bash
npm run healthcheck
```

---

## Authentication & Development Sessions

AnimeManager utilizes standard **Bearer JWT** authentication with `HS256` cryptographic signatures.

- **Development Session Automation:** In development mode (`ENABLE_DEV_AUTH=true`), the frontend automatically obtains a fresh, properly signed 24-hour development token for the default owner (`00000000-0000-0000-0000-000000000001`) from `GET /api/v1/auth/dev-session`.
- **Production Guard:** In production mode (`NODE_ENV=production`), `ENABLE_DEV_AUTH=true` is rejected immediately with a fatal startup error, ensuring development tokens cannot be generated on public deployments.
- **Token Generation CLI:** Generate testing tokens with custom claims:
  ```bash
  node scripts/generate-session-token.js --owner 00000000-0000-0000-0000-000000000001
  ```

---

## Verification & Quality Gates

Run the automated verification suites across all monorepo workspaces:

```bash
# Typecheck TypeScript across all 3 workspaces
npm run typecheck

# Lint all workspaces
npm run lint

# Run monorepo test suite (80 API tests, 51 Web tests, 5 Shared tests)
npm test

# Run Atlas Cloud Integration Suite (ACID transactions, replica set, concurrency)
npm run test:atlas

# Verify upstream metadata providers
npm run test:tenrai:live

# Compile production bundles
npm run build
```

---

## Deployment Readiness

AnimeManager is configured for serverless deployment on **Vercel** with **MongoDB Atlas**:

1. **Frontend:** Deployed as a single-page application from `apps/web/dist` with client-side route rewrites configured in `vercel.json`.
2. **Serverless API:** Deployed as an edge-routed serverless function via `api/index.js`, delegating incoming requests to the Express application.
3. **Connection Pooling:** Automatically tunes pool sizes for serverless lifecycles (`maxPoolSize: 3`, `minPoolSize: 0`, `maxIdleTimeMS: 10000`) when `VERCEL` is detected, preventing connection exhaustion on Atlas.
4. **Production Environment:** Requires setting `NODE_ENV=production`, a high-entropy `JWT_SECRET`, and `MONGODB_URI` pointing to Atlas in your hosting provider's dashboard.

---

## Project Documentation

Detailed technical documentation is available in the [`docs/`](./docs) directory:

- [Local Development Guide](./docs/LOCAL_DEVELOPMENT.md): Detailed environment configuration, startup steps, and troubleshooting.
- [System Architecture](./docs/architecture.md): Document schema designs, indexes, transaction models, and security boundaries.
- [Deployment Guide](./docs/deployment.md): Vercel configuration, environment variables, and connection pooling.
- [API Contracts](./docs/api-contracts.md): REST endpoint definitions, request/response envelopes, and error codes.
- [Known Limitations](./docs/known-limitations.md): Technical boundaries, rate limits, and scope constraints.
- [Requirements Traceability](./docs/requirements-traceability.md): Feature mapping against specifications.
- [Architecture Decision Records (ADRs)](./docs/decisions.md): Technical rationales and architectural decision history.

---

## License

Private / Personal Project. All rights reserved.
