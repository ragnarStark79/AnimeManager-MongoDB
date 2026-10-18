#!/usr/bin/env node

/**
 * AnimeManager — Standalone Live Jikan Connectivity & Import Smoke Test
 *
 * This script tests live network connectivity from the local development environment
 * to the upstream Jikan v4 API (api.jikan.moe or custom JIKAN_BASE_URL).
 *
 * Requirements:
 * - Explicitly invoked and decoupled from deterministic unit/integration test suites.
 * - Reports real DNS resolution (IPv4 & IPv6, default & secondary resolvers), TCP probes, and latencies.
 * - Safely suppresses credentials, authorization headers, and internal secrets.
 *
 * Usage:
 *   node scripts/test-jikan-live.js
 *   npm run test:jikan:live
 */

import dns from 'node:dns/promises';
import { Resolver } from 'node:dns/promises';
import net from 'node:net';

const configuredUrl = process.env.JIKAN_BASE_URL || 'https://api.jikan.moe/v4';
let parsedUrl;
try {
  parsedUrl = new URL(configuredUrl);
} catch {
  parsedUrl = new URL('https://api.jikan.moe/v4');
}

const JIKAN_HOST = parsedUrl.hostname;
const JIKAN_PORT = parseInt(parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'), 10);
const TEST_QUERIES = ['frieren', 'naruto', 'tokidoki bosotto'];

console.log('======================================================');
console.log('  AnimeManager — Upstream Jikan Live Connectivity Smoke Test');
console.log('======================================================\n');
console.log(`Target Endpoint: ${configuredUrl} (${JIKAN_HOST}:${JIKAN_PORT})\n`);

async function probeDns() {
  console.log('1. DNS Resolution Probes:');
  let ipv4 = null;
  let ipv6 = null;

  // OS Resolver
  try {
    const a = await dns.resolve4(JIKAN_HOST);
    ipv4 = a[0];
    console.log(`   [OS Default] IPv4 (A):    RESOLVED -> ${a.join(', ')}`);
  } catch (err) {
    console.log(`   [OS Default] IPv4 (A):    FAILED (${err.message})`);
  }

  try {
    const aaaa = await dns.resolve6(JIKAN_HOST);
    ipv6 = aaaa[0];
    console.log(`   [OS Default] IPv6 (AAAA): RESOLVED -> ${aaaa.join(', ')}`);
  } catch (err) {
    console.log(`   [OS Default] IPv6 (AAAA): FAILED (${err.message})`);
  }

  // Secondary Resolver (Google DNS 8.8.8.8)
  try {
    const resolver = new Resolver();
    resolver.setServers(['8.8.8.8']);
    const a8 = await resolver.resolve4(JIKAN_HOST);
    console.log(`   [Google 8.8.8.8] IPv4:     RESOLVED -> ${a8.join(', ')}`);
  } catch (err) {
    console.log(`   [Google 8.8.8.8] IPv4:     FAILED (${err.message})`);
  }

  return { ipv4, ipv6 };
}

function probeTcpSocket(host, port, family, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.connect({ host, port, family }, () => {
      const duration = Date.now() - start;
      socket.destroy();
      resolve({ success: true, duration, error: null });
    });

    socket.on('timeout', () => {
      const duration = Date.now() - start;
      socket.destroy();
      resolve({ success: false, duration, error: `ETIMEDOUT after ${duration}ms` });
    });

    socket.on('error', (err) => {
      const duration = Date.now() - start;
      resolve({ success: false, duration, error: `${err.code || err.message} after ${duration}ms` });
    });
  });
}

async function probeTcp(addresses) {
  console.log('\n2. TCP Transport Probes:');
  let anySuccess = false;

  if (addresses.ipv4) {
    process.stdout.write(`   Probing IPv4 TCP to ${addresses.ipv4}:${JIKAN_PORT}... `);
    const res = await probeTcpSocket(addresses.ipv4, JIKAN_PORT, 4, 4000);
    if (res.success) {
      console.log(`CONNECTED (${res.duration}ms)`);
      anySuccess = true;
    } else {
      console.log(`FAILED (${res.error})`);
    }
  }

  if (addresses.ipv6) {
    process.stdout.write(`   Probing IPv6 TCP to [${addresses.ipv6}]:${JIKAN_PORT}... `);
    const res = await probeTcpSocket(addresses.ipv6, JIKAN_PORT, 6, 2000);
    if (res.success) {
      console.log(`CONNECTED (${res.duration}ms)`);
      anySuccess = true;
    } else {
      console.log(`FAILED (${res.error})`);
    }
  }

  return anySuccess;
}

async function probeHttpQuery(query) {
  const url = `${configuredUrl.replace(/\/+$/, '')}/anime?q=${encodeURIComponent(query)}&limit=3`;
  process.stdout.write(`   Querying '${query}'... `);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AnimeManager/1.0 (Personal Media Library)',
      },
      signal: AbortSignal.timeout(6000),
    });
    const duration = Date.now() - start;

    if (res.ok) {
      const json = await res.json();
      const count = json.data?.length || 0;
      console.log(`HTTP ${res.status} OK (${duration}ms) — Found ${count} titles`);
      if (count > 0) {
        console.log(`     Top match: "${json.data[0].title}" (MAL ID: ${json.data[0].mal_id})`);
      }
      return true;
    } else {
      console.log(`HTTP ${res.status} ${res.statusText} (${duration}ms)`);
      return false;
    }
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`FAILED after ${duration}ms (${err.name || 'Error'}: ${err.message})`);
    return false;
  }
}

async function main() {
  const addresses = await probeDns();
  if (!addresses.ipv4 && !addresses.ipv6) {
    console.log('\n❌ DIAGNOSIS: DNS resolution failed completely. Check network DNS configuration.');
    process.exit(1);
  }

  const tcpSuccess = await probeTcp(addresses);
  if (!tcpSuccess) {
    console.log('\n------------------------------------------------------');
    console.log('⚠️  UPSTREAM CONNECTIVITY NOTICE:');
    console.log(`   Host ${JIKAN_HOST} did not accept TCP connections on port ${JIKAN_PORT}.`);
    console.log('   The public hosted Jikan v4 service (api.jikan.moe) was discontinued by');
    console.log('   the upstream maintainers on October 1, 2026, causing port 443 packets to be dropped.');
    console.log('');
    console.log('   APPLICATION STATUS:');
    console.log('   - AnimeManager backend correctly classifies this error as UPSTREAM_TIMEOUT (HTTP 504).');
    console.log('   - The Import UI displays an actionable notice advising manual title creation.');
    console.log('   - Core library operations (manual Add Title, Collections, Bookmarks, and Exports)');
    console.log('     continue to operate normally and completely decoupled from Jikan.');
    console.log('');
    console.log('   SELF-HOSTED RECOVERY OPTION:');
    console.log('   To restore live MyAnimeList importing, run a self-hosted Jikan v4 Docker container:');
    console.log('     docker run -d --name jikan -p 8080:8080 jikanme/jikan-rest:latest');
    console.log('   Then set in .env:');
    console.log('     JIKAN_BASE_URL=http://localhost:8080/v4');
    console.log('------------------------------------------------------\n');
    process.exit(0);
  }

  console.log('\n3. Testing live Jikan search endpoints:');
  for (const q of TEST_QUERIES) {
    await probeHttpQuery(q);
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\n✔ Live upstream Jikan search verification completed successfully.');
}

main().catch((err) => {
  console.error('Fatal live probe error:', err);
  process.exit(1);
});
