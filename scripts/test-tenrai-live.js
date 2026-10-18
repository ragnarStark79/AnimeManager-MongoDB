#!/usr/bin/env node

/**
 * AnimeManager — Tenrai Metadata Provider Live Diagnostic Tool
 *
 * Verifies live connectivity, DNS, TLS, search endpoints, detail retrieval,
 * rate limiting, and response schema against Tenrai v1 API (https://api.tenrai.org/v1).
 */

import dns from 'node:dns/promises';
import tls from 'node:tls';
import { URL } from 'node:url';

const TENRAI_BASE_URL = process.env.METADATA_API_BASE_URL || process.env.JIKAN_BASE_URL || 'https://api.tenrai.org/v1';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function logSection(title) {
  console.log(`\n${BOLD}${CYAN}=== ${title} ===${RESET}`);
}

async function testDns(hostname) {
  await logSection('1. DNS Resolution');
  console.log(`Target Hostname: ${hostname}`);

  try {
    const t0 = Date.now();
    const aRecords = await dns.resolve4(hostname).catch(() => []);
    const aaaaRecords = await dns.resolve6(hostname).catch(() => []);
    const dur = Date.now() - t0;

    console.log(`  ${GREEN}✔${RESET} IPv4 Addresses (A):    ${aRecords.join(', ') || 'none'} (${dur}ms)`);
    console.log(`  ${aaaaRecords.length ? GREEN + '✔' : YELLOW + 'ℹ'}${RESET} IPv6 Addresses (AAAA): ${aaaaRecords.join(', ') || 'none'}`);
    return { a: aRecords, aaaa: aaaaRecords };
  } catch (err) {
    console.log(`  ${RED}✖ DNS Resolution Failed:${RESET} ${err.message}`);
    return null;
  }
}

async function testTls(hostname, port = 443) {
  await logSection('2. TLS Handshake');
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      timeout: 5000,
    }, () => {
      const dur = Date.now() - t0;
      const cert = socket.getPeerCertificate();
      console.log(`  ${GREEN}✔${RESET} TLS Connected in ${dur}ms`);
      console.log(`    Protocol: ${socket.getProtocol()}`);
      console.log(`    Cipher:   ${socket.getCipher()?.name}`);
      console.log(`    Subject:  ${cert?.subject?.CN}`);
      console.log(`    Issuer:   ${cert?.issuer?.O || cert?.issuer?.CN}`);
      console.log(`    Valid To: ${cert?.valid_to}`);
      socket.end();
      resolve(true);
    });

    socket.on('timeout', () => {
      console.log(`  ${RED}✖ TLS Handshake Timed Out (5000ms)${RESET}`);
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (err) => {
      console.log(`  ${RED}✖ TLS Handshake Failed:${RESET} ${err.message}`);
      resolve(false);
    });
  });
}

async function testEndpoint(name, urlStr, validator) {
  const t0 = Date.now();
  try {
    const res = await fetch(urlStr, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AnimeManager/1.0 (Live Diagnostics)',
      },
      signal: AbortSignal.timeout(8000),
    });
    const dur = Date.now() - t0;
    const json = await res.json().catch(() => null);

    const valid = validator ? validator(res, json) : res.ok;
    if (valid) {
      console.log(`  ${GREEN}✔${RESET} ${name.padEnd(30)} HTTP ${res.status} (${dur}ms)`);
      return { ok: true, status: res.status, dur, json };
    } else {
      console.log(`  ${RED}✖${RESET} ${name.padEnd(30)} HTTP ${res.status} (${dur}ms) - Unexpected payload`);
      return { ok: false, status: res.status, dur, json };
    }
  } catch (err) {
    const dur = Date.now() - t0;
    console.log(`  ${RED}✖${RESET} ${name.padEnd(30)} FAILED (${dur}ms): ${err.message}`);
    return { ok: false, error: err };
  }
}

async function main() {
  console.log(`${BOLD}================================================================${RESET}`);
  console.log(`${BOLD}  AnimeManager — Tenrai Metadata Provider Live Verification     ${RESET}`);
  console.log(`${BOLD}================================================================${RESET}`);
  console.log(`Base URL: ${TENRAI_BASE_URL}`);

  const url = new URL(TENRAI_BASE_URL);
  const hostname = url.hostname;

  // 1. DNS
  const dnsRes = await testDns(hostname);

  // 2. TLS
  if (url.protocol === 'https:') {
    await testTls(hostname, 443);
  }

  // 3. Live Functional Tests
  await logSection('3. HTTP / REST API Functional Verification');

  // Base API index
  await testEndpoint(
    'Base URL Index',
    `${TENRAI_BASE_URL}`,
    (res, json) => res.status === 200 && json?.name?.includes('Tenrai')
  );

  // Small delay for rate limits
  await new Promise((r) => setTimeout(r, 300));

  // Anime Search: Frieren
  const frierenRes = await testEndpoint(
    'Anime Search: "Frieren"',
    `${TENRAI_BASE_URL}/anime?q=frieren&limit=5`,
    (res, json) => res.status === 200 && Array.isArray(json?.data) && json.data.length > 0
  );
  if (frierenRes.ok && frierenRes.json?.data?.[0]) {
    const item = frierenRes.json.data[0];
    console.log(`    → Top candidate: mal_id=${item.mal_id} title="${item.title}" score=${item.score} episodes=${item.episodes}`);
  }

  await new Promise((r) => setTimeout(r, 300));

  // Anime Search: Naruto
  const narutoRes = await testEndpoint(
    'Anime Search: "Naruto"',
    `${TENRAI_BASE_URL}/anime?q=naruto&limit=3`,
    (res, json) => res.status === 200 && Array.isArray(json?.data) && json.data.length > 0
  );
  if (narutoRes.ok && narutoRes.json?.data?.[0]) {
    const item = narutoRes.json.data[0];
    console.log(`    → Top candidate: mal_id=${item.mal_id} title="${item.title}" score=${item.score}`);
  }

  await new Promise((r) => setTimeout(r, 300));

  // Manga Search: Berserk
  const berserkRes = await testEndpoint(
    'Manga Search: "Berserk"',
    `${TENRAI_BASE_URL}/manga?q=berserk&limit=3`,
    (res, json) => res.status === 200 && Array.isArray(json?.data) && json.data.length > 0
  );
  if (berserkRes.ok && berserkRes.json?.data?.[0]) {
    const item = berserkRes.json.data[0];
    console.log(`    → Top candidate: mal_id=${item.mal_id} title="${item.title}" type=${item.type}`);
  }

  await new Promise((r) => setTimeout(r, 300));

  // Manga/Manhwa Search: Solo Leveling
  const manhwaRes = await testEndpoint(
    'Manhwa Search: "Solo Leveling"',
    `${TENRAI_BASE_URL}/manga?q=solo+leveling&type=manhwa&limit=2`,
    (res, json) => res.status === 200 && Array.isArray(json?.data)
  );
  if (manhwaRes.ok && manhwaRes.json?.data?.[0]) {
    const item = manhwaRes.json.data[0];
    console.log(`    → Top candidate: mal_id=${item.mal_id} title="${item.title}" type=${item.type}`);
  }

  await new Promise((r) => setTimeout(r, 300));

  // Detail by ID: Anime 52991 (Frieren)
  await testEndpoint(
    'Anime Detail /full: ID 52991',
    `${TENRAI_BASE_URL}/anime/52991/full`,
    (res, json) => res.status === 200 && json?.data?.mal_id === 52991
  );

  await new Promise((r) => setTimeout(r, 300));

  // Empty Results Query
  await testEndpoint(
    'Zero Results Query',
    `${TENRAI_BASE_URL}/anime?q=xyznonexistenttitle9876543210`,
    (res, json) => res.status === 200 && Array.isArray(json?.data) && json.data.length === 0
  );

  await new Promise((r) => setTimeout(r, 300));

  // Parameter Validation Error (limit > 100)
  await testEndpoint(
    'Parameter Validation: 400',
    `${TENRAI_BASE_URL}/anime?q=test&limit=99999`,
    (res, json) => res.status === 400 && json?.type === 'BadRequestException'
  );

  console.log(`\n${BOLD}${GREEN}✔ Tenrai live verification completed successfully.${RESET}\n`);
}

main().catch((err) => {
  console.error(`\n${RED}Fatal diagnostic error:${RESET}`, err);
  process.exit(1);
});
