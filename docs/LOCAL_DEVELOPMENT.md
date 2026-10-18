# AnimeManager — Local Development & Startup Guide

**Edition:** MongoDB Edition  
**Version:** 2.0  
**Status:** Verified & Operational  

---

## 1. System Requirements & Prerequisites

Before starting local development, ensure your environment has the following software installed:

| Software | Required Version | Verification Command | Purpose |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (Recommended: Node 20+ LTS or 22+) | `node -v` | JavaScript runtime for API and Web apps |
| **npm** | `>= 10.0.0` | `npm -v` | Monorepo package manager and workspace runner |
| **MongoDB Atlas** | Hosted cluster (M0 free tier or higher) | N/A | Primary cloud database provider |
| **Local MongoDB** | Optional: `>= 6.0` (mongod on port 27017) | `mongod --version` | Optional local development & unit test fallback |

---

## 2. Dependency Installation

AnimeManager is structured as an npm monorepo with workspaces (`packages/*`, `apps/*`). Install all dependencies once from the repository root:

```bash
npm install
```

This installs dependencies across the root, `packages/shared`, `apps/api`, and `apps/web` while establishing workspace symlinks.

---

## 3. Local Environment Configuration

Copy the documented environment template to create your local `.env` file:

```bash
cp .env.example .env
```

### Environment Variable Partitioning

Variables are strictly partitioned between the Express REST API backend and the Vite frontend:

#### Backend Only (Server-Side Secrets)
These variables must **never** be exposed to the client bundle:
- `PORT`: Port Express listens on (default: `4000`).
- `NODE_ENV`: Set to `development` for local work.
- `MONGODB_URI`: MongoDB connection string (`mongodb+srv://...` for Atlas, or `mongodb://127.0.0.1:27017` for local).
- `MONGODB_DB_NAME`: Database name (default: `animemanager`).
- `JWT_SECRET`: Signing secret for authentication tokens (minimum 16 characters; must not be default in production).
- `ENABLE_DEV_AUTH`: Set to `true` for development; rejected automatically in production.
- `CORS_ORIGIN`: Allowed frontend origin (default: `http://localhost:5173`).
- `METADATA_API_BASE_URL`: External metadata provider URL (default: `https://api.tenrai.org/v1`).

#### Frontend Safe Variables (`VITE_` Prefix)
Only variables prefixed with `VITE_` are embedded into the client bundle by Vite:
- `VITE_API_BASE_URL`: Set to `/api/v1` in local development so the browser sends requests through the Vite development proxy (`http://localhost:5173/api/v1/...`) to avoid cross-origin friction.
- `VITE_APP_TITLE`: Application title (default: `AnimeManager`).

> [!NOTE]
> In local development mode (`npm run dev`), the frontend automatically acquires a fresh development JWT session for the default test owner (`00000000-0000-0000-0000-000000000001`) from `GET /api/v1/auth/dev-session`. You do not need to configure a static JWT in environment variables.

> [!IMPORTANT]
> Never commit `.env` to Git. The `.gitignore` file excludes all `.env` files.

---

## 4. Development Server Startup

### Start Frontend and Backend Concurrently (Recommended)

Run the root development command:

```bash
npm run dev
```

This executes `scripts/dev.js`, which:
1. Validates that ports `4000` and `5173` are available.
2. Compiles TypeScript project references to ensure fresh build artifacts.
3. Spawns the Express REST API (`node --watch dist/server.js`) on `http://localhost:4000`.
4. Spawns the Vite development server (`npm run dev` in `apps/web`) on `http://localhost:5173`.

Access points:
- **Web UI:** [http://localhost:5173](http://localhost:5173)
- **API Health:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

### Running Services Independently

You can also run workspaces separately:

```bash
# Terminal 1 — Start API Backend
npm run dev:api

# Terminal 2 — Start Frontend
npm run dev:web
```

---

## 5. Health Probes & Connectivity

Verify that both the API and database connection are responsive:

```bash
npm run healthcheck
```

This pings `/api/v1/health` and displays the sanitized database target, collection count, and readiness status.

---

## 6. Testing & Quality Verification

Run the verification suites from the repository root:

```bash
# Typecheck all workspaces
npm run typecheck

# Lint all workspaces
npm run lint

# Run monorepo test suites (local API, web, and shared schemas)
npm test

# Run Atlas Cloud Integration Tests (requires MONGODB_URI pointing to Atlas)
npm run test:atlas

# Compile production bundle
npm run build
```

### Test Database Safety Isolation
- **Local Tests:** `npm test` runs local unit and integration tests against the isolated `animemanager_test` database on local MongoDB (`127.0.0.1:27017`).
- **Atlas Cloud Tests:** `npm run test:atlas` runs against a dedicated verification database named `animemanager_atlas_verification_test`.
- **Active Data Protection:** Destructive cleanup operations and drops are strictly prohibited on `animemanager`.

---

## 7. Troubleshooting

### 1. MongoDB Atlas Connection Timeout (`ETIMEDOUT` / `ServerSelectionError`)
- **Cause:** Your current public IP address is not permitted in MongoDB Atlas Network Access.
- **Solution:** In the MongoDB Atlas Dashboard, navigate to **Security > Network Access** and add your current IP address (or `0.0.0.0/0` with proper credential protection for dynamic networks).

### 2. Development Session Expired or Invalid (HTTP 401)
- **Cause:** Stale token in browser `localStorage`.
- **Solution:** Navigate to the **Settings** page in the UI and click **Clear Local Session**, or restart the development server. The frontend will acquire a fresh development token automatically.

### 3. Port Conflict on Port 4000 or 5173
- **Cause:** Another process is listening on the API or Vite port.
- **Solution:** Identify and stop the conflicting process:
  ```bash
  lsof -nP -iTCP:4000 -sTCP:LISTEN
  lsof -nP -iTCP:5173 -sTCP:LISTEN
  ```
