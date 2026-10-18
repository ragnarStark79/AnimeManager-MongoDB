import { BadRequestError } from '../../errors/index.js';

export interface ParsedMalTarget {
  mediaType: 'anime' | 'manga';
  id: number;
  canonicalUrl: string;
}

/**
 * Validates and parses a MyAnimeList URL with strict SSRF defenses.
 *
 * Requirements:
 * - Protocol: strictly https:
 * - Host: strictly myanimelist.net (no lookalikes, no IP addresses, no subdomains)
 * - Port: default 443 only (no arbitrary ports)
 * - Credentials: username/password in URL strictly forbidden
 * - Path: strictly /anime/{numericId} or /manga/{numericId} with optional slug
 * - Query strings and hash fragments are safely discarded
 */
export function parseMalUrl(rawUrl: string): ParsedMalTarget {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new BadRequestError('Invalid MyAnimeList URL: URL string cannot be empty');
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestError('Invalid MyAnimeList URL: malformed URL syntax');
  }

  // 1. Strict Protocol
  if (parsed.protocol !== 'https:') {
    throw new BadRequestError('Invalid MyAnimeList URL: protocol must be https');
  }

  // 2. Strict Hostname (must exactly equal myanimelist.net in lowercase)
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'myanimelist.net') {
    throw new BadRequestError('Invalid MyAnimeList URL: domain must be exactly myanimelist.net');
  }

  // 3. Reject credentials
  if (parsed.username || parsed.password) {
    throw new BadRequestError('Invalid MyAnimeList URL: embedded credentials are not permitted');
  }

  // 4. Reject non-standard ports
  if (parsed.port && parsed.port !== '443') {
    throw new BadRequestError('Invalid MyAnimeList URL: custom ports are not permitted');
  }

  // 5. Strict Path Pattern: /(anime|manga)/{id}(/{slug})?(/)?
  const pathname = parsed.pathname;
  const pathRegex = /^\/(anime|manga)\/([1-9]\d*)(?:\/[^/]*)?\/?$/;
  const match = pathname.match(pathRegex);

  if (!match) {
    throw new BadRequestError(
      'Invalid MyAnimeList URL: path must match /anime/{id} or /manga/{id}'
    );
  }

  const mediaType = match[1] as 'anime' | 'manga';
  const rawId = match[2];
  const id = parseInt(rawId, 10);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid MyAnimeList URL: target ID must be a positive integer');
  }

  return {
    mediaType,
    id,
    canonicalUrl: `https://myanimelist.net/${mediaType}/${id}`,
  };
}

/**
 * Validates a direct numeric MAL ID and explicit media type.
 */
export function validateMalIdAndType(id: number, type: string): ParsedMalTarget {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid MyAnimeList ID: must be a positive integer');
  }

  if (type !== 'anime' && type !== 'manga') {
    throw new BadRequestError("Invalid media type: must be 'anime' or 'manga'");
  }

  return {
    mediaType: type,
    id,
    canonicalUrl: `https://myanimelist.net/${type}/${id}`,
  };
}
