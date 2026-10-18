import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMalUrl, validateMalIdAndType } from '../dist/services/import/url-parser.js';

test('MAL URL Parser: Valid anime and manga URLs with optional slugs and slashes', () => {
  // Simple anime URL
  const r1 = parseMalUrl('https://myanimelist.net/anime/5114');
  assert.equal(r1.mediaType, 'anime');
  assert.equal(r1.id, 5114);
  assert.equal(r1.canonicalUrl, 'https://myanimelist.net/anime/5114');

  // Anime URL with title slug
  const r2 = parseMalUrl('https://myanimelist.net/anime/5114/Fullmetal_Alchemist_Brotherhood');
  assert.equal(r2.mediaType, 'anime');
  assert.equal(r2.id, 5114);
  assert.equal(r2.canonicalUrl, 'https://myanimelist.net/anime/5114');

  // Manga URL with slug and trailing slash
  const r3 = parseMalUrl('https://myanimelist.net/manga/13/One_Piece/');
  assert.equal(r3.mediaType, 'manga');
  assert.equal(r3.id, 13);
  assert.equal(r3.canonicalUrl, 'https://myanimelist.net/manga/13');

  // Manga URL without slug, with trailing slash
  const r4 = parseMalUrl('https://myanimelist.net/manga/99002/');
  assert.equal(r4.mediaType, 'manga');
  assert.equal(r4.id, 99002);
});

test('MAL URL Parser: Safely strips and ignores query parameters and hash fragments', () => {
  const r1 = parseMalUrl('https://myanimelist.net/anime/5114?q=fmab&cat=anime');
  assert.equal(r1.id, 5114);
  assert.equal(r1.mediaType, 'anime');
  assert.equal(r1.canonicalUrl, 'https://myanimelist.net/anime/5114');

  const r2 = parseMalUrl('https://myanimelist.net/manga/25/Fullmetal_Alchemist#reviews');
  assert.equal(r2.id, 25);
  assert.equal(r2.mediaType, 'manga');
  assert.equal(r2.canonicalUrl, 'https://myanimelist.net/manga/25');
});

test('MAL URL Parser: Validates direct numeric ID and media type', () => {
  const r1 = validateMalIdAndType(5114, 'anime');
  assert.equal(r1.id, 5114);
  assert.equal(r1.mediaType, 'anime');
  assert.equal(r1.canonicalUrl, 'https://myanimelist.net/anime/5114');

  const r2 = validateMalIdAndType(100, 'manga');
  assert.equal(r2.id, 100);
  assert.equal(r2.mediaType, 'manga');

  // Rejects invalid media types
  assert.throws(() => validateMalIdAndType(100, 'cartoon'), /Invalid media type/);
  assert.throws(() => validateMalIdAndType(100, 'manhwa'), /Invalid media type/); // Jikan uses 'manga' for manhwa queries

  // Rejects non-positive or invalid IDs
  assert.throws(() => validateMalIdAndType(-5, 'anime'), /positive integer/);
  assert.throws(() => validateMalIdAndType(0, 'anime'), /positive integer/);
  assert.throws(() => validateMalIdAndType(1.5, 'anime'), /positive integer/);
});

test('SSRF Defenses: Rejects lookalike hosts, IP addresses, localhost, and cloud metadata', () => {
  const adversarialUrls = [
    'http://myanimelist.net/anime/5114', // Plain HTTP rejected
    'https://myanimelist.net.attacker.com/anime/5114', // Lookalike domain
    'https://attacker-myanimelist.net/anime/5114',
    'https://myanimelist.org/anime/5114', // Wrong TLD
    'https://api.myanimelist.net/anime/5114', // Subdomain rejected
    'https://127.0.0.1/anime/5114', // Local IPv4
    'https://localhost/anime/5114', // Localhost
    'https://169.254.169.254/anime/5114', // AWS metadata endpoint
    'https://[::1]/anime/5114', // Local IPv6
    'file:///etc/passwd', // File scheme
    'ftp://myanimelist.net/anime/5114', // FTP scheme
    'javascript:alert(1)', // JavaScript URI
    'data:text/html,malicious', // Data URI
    'https://myanimelist.net:8080/anime/5114', // Custom port
    'https://myanimelist.net:80/anime/5114', // Mismatched port
    'https://user:password@myanimelist.net/anime/5114', // Embedded credentials
    'https://myanimelist.net/anime/0', // Zero ID rejected
    'https://myanimelist.net/anime/-5114', // Negative ID rejected
    'https://myanimelist.net/anime/abc', // Non-numeric ID
    'https://myanimelist.net/characters/5114', // Unsupported path
    'https://myanimelist.net/anime/5114/extra/nested/path', // Path traversal / deep nesting
    'https://myanimelist.net/anime/../5114', // Directory traversal
  ];

  for (const url of adversarialUrls) {
    assert.throws(
      () => parseMalUrl(url),
      /Invalid MyAnimeList URL/,
      `Expected ${url} to be rejected by SSRF filters`
    );
  }
});
