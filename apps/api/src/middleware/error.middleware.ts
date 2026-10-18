import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/index.js';
import { config } from '../config/index.js';

interface PgDatabaseError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'req_unknown';
  const timestamp = new Date().toISOString();

  // Handled AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details || [],
      },
      meta: {
        requestId,
        timestamp,
      },
    });
    return;
  }

  // Handle body-parser malformed JSON syntax errors
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'MALFORMED_INPUT',
        message: 'Invalid JSON syntax in request body',
        details: [],
      },
      meta: { requestId, timestamp },
    });
    return;
  }

  // Handle body-parser payload limit exceeded
  if ('type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the maximum allowed size of 1MB',
        details: [],
      },
      meta: { requestId, timestamp },
    });
    return;
  }

  // Handle PostgreSQL specific constraint codes
  const pgErr = err as PgDatabaseError;
  if (pgErr.code === '23505') {
    // Unique violation
    let message = 'A record with this identifier or name already exists';
    if (pgErr.constraint && pgErr.constraint.includes('collection')) {
      message = 'A collection with this name already exists in your library';
    } else if (pgErr.constraint && pgErr.constraint.includes('bookmark')) {
      message = 'A bookmark for this title already exists';
    }
    res.status(409).json({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message,
        details: [],
      },
      meta: { requestId, timestamp },
    });
    return;
  }

  if (pgErr.code === '23503') {
    // Foreign key violation
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Referenced parent record does not exist or has been removed',
        details: [],
      },
      meta: { requestId, timestamp },
    });
    return;
  }

  if (pgErr.code === '23514') {
    // Check constraint violation
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Value violates database domain constraints',
        details: [],
      },
      meta: { requestId, timestamp },
    });
    return;
  }

  // Handle database connection and reachability failures (predictable HTTP 503)
  if (isDatabaseConnectivityError(err)) {
    if (config.NODE_ENV !== 'test') {
      const sanitizedSummary = err instanceof Error ? err.message.split('\n')[0] : 'Unknown database error';
      console.error(
        `[Database Connectivity Error] [${requestId}] Database unreachable (${pgErr.code || 'NO_CODE'}): ${sanitizedSummary}`
      );
    }
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database service is temporarily unavailable. Please verify network connectivity.',
        details: [],
      },
      meta: { requestId, timestamp },
    });
    return;
  }

  // Unexpected internal server error (never leak stack traces or connection strings)
  if (config.NODE_ENV !== 'test') {
    console.error(`[Unhandled Error] [${requestId}]`, err);
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred',
      details: [],
    },
    meta: {
      requestId,
      timestamp,
    },
  });
}

export function isDatabaseConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string | number; message?: string; name?: string };

  const networkCodes = ['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'];
  if (e.code && typeof e.code === 'string' && networkCodes.includes(e.code)) return true;

  const mongoNames = [
    'MongoServerSelectionError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoTopologyClosedError',
    'MongoServerClosedError',
    'MongoNotConnectedError',
  ];
  if (e.name && mongoNames.includes(e.name)) return true;

  const pgConnCodes = [
    '28P01', // password authentication failed
    '28000', // invalid authorization specification
    '08000', // connection exception
    '08003', // connection does not exist
    '08006', // connection failure
    '08001', // sqlclient unable to establish connection
    '08004', // server rejected connection
    '57P01', // admin shutdown
    '57P02', // crash shutdown
    '57P03', // cannot connect now
    'XX000', // internal server error / pooler tenant error
  ];
  if (e.code && typeof e.code === 'string' && pgConnCodes.includes(e.code)) return true;

  const msg = typeof e.message === 'string' ? e.message : '';
  if (
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('timeout exceeded when connecting') ||
    msg.includes('connect ECONNREFUSED') ||
    msg.includes('connect EHOSTUNREACH') ||
    msg.includes('Server selection timed out') ||
    msg.includes('Topology is closed') ||
    msg.includes('Client must be connected before running operations') ||
    msg.includes('tenant/user')
  ) {
    return true;
  }

  return false;
}

