#!/usr/bin/env node

/**
 * AnimeManager — Root Development Runner
 * Starts both the Express REST API and the Vite frontend concurrently with unified logging.
 */

import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const apiDir = path.resolve(rootDir, 'apps/api');
const webDir = path.resolve(rootDir, 'apps/web');

const API_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const WEB_PORT = 5173;

// ANSI color codes
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    s.once('listening', () => {
      s.close();
      resolve(false);
    });
    s.listen(port, '127.0.0.1');
  });
}

function pipeOutput(stream, prefix, color) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    console.log(`${color}${prefix}${RESET} ${line}`);
  });
}

async function main() {
  console.log(`${BOLD}======================================================${RESET}`);
  console.log(`${BOLD}  AnimeManager — Local Development Environment       ${RESET}`);
  console.log(`${BOLD}======================================================${RESET}\n`);

  // Check if ports are already bound
  const apiInUse = await checkPort(API_PORT);
  const webInUse = await checkPort(WEB_PORT);

  if (apiInUse) {
    console.warn(`${YELLOW}[dev] Warning: Port ${API_PORT} is already in use.${RESET}`);
    console.warn(`${YELLOW}[dev] Another instance of the API may already be running.${RESET}\n`);
  }
  if (webInUse) {
    console.warn(`${YELLOW}[dev] Notice: Port ${WEB_PORT} is already in use.${RESET}`);
    console.warn(`${YELLOW}[dev] Vite may automatically bind to an alternative port or share the port.${RESET}\n`);
  }

  // Ensure API TypeScript files are compiled before launch
  console.log(`${CYAN}[dev] Building API workspace TypeScript...${RESET}`);
  try {
    execSync('npm --prefix apps/api run build', { cwd: rootDir, stdio: 'inherit' });
    console.log(`${GREEN}[dev] API build ready.${RESET}\n`);
  } catch {
    console.error(`${RED}[dev] Failed to compile API workspace. Check TypeScript errors above.${RESET}`);
    process.exit(1);
  }

  console.log(`${BOLD}Starting API on http://localhost:${API_PORT} and Web on http://localhost:${WEB_PORT}...${RESET}`);
  console.log(`${YELLOW}Press Ctrl+C to stop both processes cleanly.\n${RESET}`);

  let shuttingDown = false;
  const children = [];

  // Spawn API
  const apiProcess = spawn('node', ['--watch', 'dist/server.js'], {
    cwd: apiDir,
    env: { ...process.env, PORT: String(API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push({ name: 'api', proc: apiProcess });
  pipeOutput(apiProcess.stdout, '[api]', CYAN);
  pipeOutput(apiProcess.stderr, '[api:err]', RED);

  // Spawn Web
  const webProcess = spawn('npm', ['run', 'dev'], {
    cwd: webDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push({ name: 'web', proc: webProcess });
  pipeOutput(webProcess.stdout, '[web]', MAGENTA);
  pipeOutput(webProcess.stderr, '[web:err]', RED);

  function cleanup(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${YELLOW}[dev] Stopping AnimeManager development servers...${RESET}`);
    for (const { proc } of children) {
      if (!proc.killed) {
        try {
          proc.kill('SIGINT');
        } catch {
          // ignore
        }
      }
    }

    setTimeout(() => {
      for (const { proc } of children) {
        if (!proc.killed) {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }
      process.exit(exitCode);
    }, 1500);
  }

  apiProcess.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`${RED}[dev] API process exited unexpectedly (code: ${code}, signal: ${signal})${RESET}`);
      cleanup(code || 1);
    }
  });

  webProcess.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`${RED}[dev] Web process exited unexpectedly (code: ${code}, signal: ${signal})${RESET}`);
      cleanup(code || 1);
    }
  });

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
}

main().catch((err) => {
  console.error('[dev] Fatal error starting development environment:', err);
  process.exit(1);
});
