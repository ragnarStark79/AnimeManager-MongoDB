# AnimeManager — Deployment & Production Guide

**Edition:** MongoDB Edition  
**Version:** 2.0  
**Status:** Certified Deployment-Ready  

---

## 1. Deployment Architecture Overview

AnimeManager is architected for deployment as a unified monorepo on **Vercel** backed by **MongoDB Atlas** for document persistence:

```mermaid
graph TD
    User["End User (Browser)"]
    VercelEdge["Vercel Edge Network<br/>Static CDN & Routing (/api rewrites)"]
    Frontend["SPA Frontend<br/>apps/web/dist (Vite Build)"]
    ServerlessAPI["Serverless Function API<br/>api/index.js (Express app delegate)"]
    Atlas[("MongoDB Atlas Cloud<br/>M0 / Dedicated Cluster (Tokyo/Global)")]
    Metadata["Tenrai v1 / Jikan MAL<br/>External Metadata Gateway"]

    User -->|HTTPS| VercelEdge
    VercelEdge -->|Static Assets & HTML5 fallback| Frontend
    VercelEdge -->|/api/* requests| ServerlessAPI
    ServerlessAPI -->|MongoDB Connection Pool| Atlas
    ServerlessAPI -->|Outbound HTTPS| Metadata
```

---

## 2. Production Environment Variables

Configure the following variables in your hosting provider's project settings (e.g. Vercel Project Settings > Environment Variables).

### Backend Runtime Variables (Vercel Functions / Server)
| Variable Name | Required | Example Placeholder | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Activates production security guards. |
| `MONGODB_URI` | Yes | `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority` | Hosted MongoDB Atlas connection string. |
| `MONGODB_DB_NAME` | Yes | `animemanager` | Target Atlas database name. |
| `JWT_SECRET` | Yes | `[GENERATE_HIGH_ENTROPY_RANDOM_SECRET]` | Secret for verifying Bearer tokens (min 16 chars). |
| `CORS_ORIGIN` | Yes | `https://your-domain.vercel.app` | Allowed frontend production origin. |
| `ENABLE_DEV_AUTH` | No | *(Must remain unset or false)* | Rejected automatically in production if true. |
| `METADATA_API_BASE_URL` | No | `https://api.tenrai.org/v1` | External metadata provider. |

### Frontend Build Variables (Vite Bundle)
| Variable Name | Required | Example Placeholder | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | No | `/api/v1` | Relative API path for unified Vercel deployment. |
| `VITE_APP_TITLE` | No | `AnimeManager` | Application title display. |

---

## 3. Serverless Connection Pooling

In a serverless environment (such as AWS Lambda or Vercel Serverless Functions), stateless function instances can spin up concurrently. AnimeManager's MongoDB layer detects serverless environments (`process.env.VERCEL`) and automatically optimizes connection pooling:
- `maxPoolSize`: Capped at `3` per container (prevents exhausting Atlas connection limits during spikes).
- `minPoolSize`: `0` (permits idle sockets to close).
- `maxIdleTimeMS`: `10000` (10s idle socket reclamation).
- `clientInstance` reuse: Active clients are cached globally across function invocations within the same container.

---

## 4. Production Security & Fail-Safe Guards

The backend includes startup assertions in `config/index.ts` that will immediately throw a fatal error on boot if insecure configurations are detected in production:
1. **Rejection of Development Auth:** If `NODE_ENV === 'production'` and `ENABLE_DEV_AUTH === true`, the API refuses to start.
2. **Rejection of Default Secrets:** If `JWT_SECRET` matches the development fallback placeholder string, the API refuses to start.
3. **Rejection of Localhost DB:** If `NODE_ENV === 'production'` and `MONGODB_URI` points to `localhost` or `127.0.0.1`, the API refuses to start.

---

## 5. Vercel Deployment Configuration

The repository includes a root `vercel.json` configured for unified full-stack hosting:

```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

- **API Entry Point:** `api/index.js` imports the Express application from `apps/api/dist/app.js` and forwards incoming serverless requests.
- **Frontend Output:** Static assets from `apps/web/dist` are served by Vercel Edge with HTML5 client-side routing fallback.
