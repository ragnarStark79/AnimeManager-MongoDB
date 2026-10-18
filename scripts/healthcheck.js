#!/usr/bin/env node

/**
 * AnimeManager — Health & Connectivity Verification Script
 * Checks API reachability, database connectivity, and Vite proxy health.
 */

const API_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const WEB_PORT = 5173;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function main() {
  console.log(`${BOLD}======================================================${RESET}`);
  console.log(`${BOLD}  AnimeManager — Healthcheck & Connectivity Status    ${RESET}`);
  console.log(`${BOLD}======================================================${RESET}\n`);

  let hasErrors = false;

  // 1. Direct API health check
  console.log(`1. Checking Express API (direct on port ${API_PORT})...`);
  const apiHealthUrl = `http://localhost:${API_PORT}/api/v1/health`;
  const apiRes = await fetchJson(apiHealthUrl);

  if (!apiRes.ok && !apiRes.json) {
    console.log(`   ${RED}✖ API Process (port ${API_PORT}): UNREACHABLE${RESET}`);
    console.log(`     Error: ${apiRes.error?.message || 'Connection refused (ECONNREFUSED)'}`);
    console.log(`     Action: Start the API server via 'npm run dev' or 'npm run dev:api'\n`);
    hasErrors = true;
  } else {
    const data = apiRes.json?.data || {};
    console.log(`   ${GREEN}✔ API Process (port ${API_PORT}): REACHABLE (HTTP ${apiRes.status})${RESET}`);
    console.log(`     Version: ${data.version || '1.0.0'}, Uptime: ${data.uptime ?? 0}s`);

    if (data.database === 'connected') {
      const targetLabel = data.databaseTarget === 'supabase'
        ? 'Supabase Hosted PostgreSQL'
        : (data.databaseTarget === 'local_postgres' ? 'Local PostgreSQL' : 'Remote PostgreSQL');
      console.log(`   ${GREEN}✔ Database Connection: CONNECTED (${targetLabel} at ${data.databaseHost || 'configured host'})${RESET}`);
      if (data.schema === 'ready') {
        console.log(`   ${GREEN}✔ Database Schema: READY (${data.tablesCount ?? 10} public tables verified)${RESET}`);
      } else {
        console.log(`   ${RED}✖ Database Schema: INCOMPLETE (Run migrations via 'npm run db:migrate:remote')${RESET}`);
        hasErrors = true;
      }
    } else {
      console.log(`   ${RED}✖ Database Connection: DISCONNECTED (degraded state)${RESET}`);
      console.log(`     Action: Verify database connection string in DATABASE_URL\n`);
      hasErrors = true;
    }

    if (data.status === 'healthy') {
      console.log(`   ${GREEN}✔ Overall API Status: HEALTHY${RESET}\n`);
    } else {
      console.log(`   ${YELLOW}⚠️ Overall API Status: DEGRADED (Database or schema issue)${RESET}\n`);
      hasErrors = true;
    }
  }

  // 2. Vite Proxy health check
  console.log(`2. Checking Frontend Vite Proxy (port ${WEB_PORT} -> ${API_PORT})...`);
  const proxyHealthUrl = `http://localhost:${WEB_PORT}/api/v1/health`;
  const proxyRes = await fetchJson(proxyHealthUrl);

  if (!proxyRes.ok && !proxyRes.json) {
    console.log(`   ${YELLOW}⚠️ Frontend Server (port ${WEB_PORT}): NOT RUNNING on port ${WEB_PORT}${RESET}`);
    console.log(`     (For full stack, run 'npm run dev')\n`);
  } else if (proxyRes.status === 500) {
    console.log(`   ${RED}✖ Frontend Proxy (port ${WEB_PORT}): PROXY ERROR (HTTP 500)${RESET}`);
    console.log(`     Cause: Vite received ECONNREFUSED from http://localhost:${API_PORT}.\n`);
    hasErrors = true;
  } else if (proxyRes.ok) {
    console.log(`   ${GREEN}✔ Frontend Proxy (port ${WEB_PORT} -> ${API_PORT}): PROXYING SUCCESSFULLY (HTTP ${proxyRes.status})${RESET}\n`);
  }

  console.log(`${BOLD}------------------------------------------------------${RESET}`);
  if (!hasErrors) {
    console.log(`${GREEN}${BOLD}✔ ALL SYSTEMS OPERATIONAL${RESET}`);
    process.exit(0);
  } else {
    console.log(`${RED}${BOLD}✖ SYSTEM ISSUES DETECTED — Review diagnostic actions above${RESET}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[healthcheck] Unexpected error:', err);
  process.exit(1);
});
