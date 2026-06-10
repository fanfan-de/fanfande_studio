#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { watch } from 'node:fs';

const args = process.argv.slice(2);

function readOption(name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }

  return undefined;
}

function readBoolean(name, fallback) {
  const value = readOption(name);
  if (value === undefined) {
    return fallback;
  }

  if (value === '' || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }

  if (value === 'false' || value === '0' || value === 'no') {
    return false;
  }

  return fallback;
}

function readNumber(name, fallback) {
  const value = readOption(name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function printUsage() {
  const scriptName = path.basename(fileURLToPath(import.meta.url));
  console.error(`
Usage:
  node ./scripts/${scriptName} --path <folder> --command <command> [options]

Options:
  --recursive              Watch child folders too.
  --debounce-ms <number>   Delay duplicate file events. Default: 500.
  --stability-ms <number>  Wait for files to stop changing. Default: 1000.
  --stability-timeout-ms <number>
                           Stop waiting for file stability after this time. Default: 30000.
  --exit-on-error          Stop the watcher if the task exits with a non-zero code.

Environment variables:
  WATCH_FOLDER             Fallback for --path.
  WATCH_COMMAND            Fallback for --command.
  WATCH_RECURSIVE          Fallback for --recursive.

Task environment variables:
  WATCH_ROOT               The watched folder.
  WATCH_PATH               The new file or folder path.
  WATCH_NAME               The new file or folder name.
  WATCH_TYPE               "file" or "directory".
  WATCH_EVENT              Always "added".
`);
}

const watchFolderInput = readOption('path') ?? process.env.WATCH_FOLDER;
const command = readOption('command') ?? process.env.WATCH_COMMAND;
const recursive = readBoolean(
  'recursive',
  ['true', '1', 'yes'].includes(String(process.env.WATCH_RECURSIVE).toLowerCase()),
);
const debounceMs = readNumber('debounce-ms', 500);
const stabilityMs = readNumber('stability-ms', 1000);
const stabilityTimeoutMs = readNumber('stability-timeout-ms', 30_000);
const exitOnError = readBoolean('exit-on-error', false);
const wantsHelp = args.includes('--help') || args.includes('-h');

if (wantsHelp) {
  printUsage();
  process.exit(0);
}

if (!watchFolderInput || !command) {
  printUsage();
  process.exit(1);
}

const watchRoot = path.resolve(watchFolderInput);

if (!existsSync(watchRoot)) {
  console.error(`[watch-folder] Folder does not exist: ${watchRoot}`);
  process.exit(1);
}

const rootStats = await stat(watchRoot).catch(() => null);
if (!rootStats?.isDirectory()) {
  console.error(`[watch-folder] Path is not a folder: ${watchRoot}`);
  process.exit(1);
}

const knownPaths = new Set();
const pendingTimers = new Map();
const taskQueue = [];
let isRunningTask = false;
let isStopping = false;
let watcher;

function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function rememberExisting(folder) {
  const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
    console.error(`[watch-folder] Failed to read ${folder}: ${error.message}`);
    return [];
  });

  for (const entry of entries) {
    const absolutePath = path.join(folder, entry.name);
    knownPaths.add(normalizePath(absolutePath));

    if (recursive && entry.isDirectory()) {
      await rememberExisting(absolutePath);
    }
  }
}

async function rememberChildren(folder) {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const absolutePath = path.join(folder, entry.name);
    knownPaths.add(normalizePath(absolutePath));

    if (entry.isDirectory()) {
      await rememberChildren(absolutePath);
    }
  }
}

async function waitForStableFile(filePath, initialStats) {
  if (!initialStats.isFile() || stabilityMs === 0) {
    return initialStats;
  }

  const startedAt = Date.now();
  let previous = initialStats;

  while (Date.now() - startedAt < stabilityTimeoutMs) {
    await delay(stabilityMs);

    const current = await stat(filePath).catch(() => null);
    if (!current) {
      return null;
    }

    if (current.size === previous.size && current.mtimeMs === previous.mtimeMs) {
      return current;
    }

    previous = current;
  }

  console.warn(`[watch-folder] File did not become stable before timeout: ${filePath}`);
  return previous;
}

function schedulePathCheck(filePath) {
  const normalized = normalizePath(filePath);
  const existingTimer = pendingTimers.get(normalized);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(normalized);
    void handlePossibleAddition(filePath);
  }, debounceMs);

  pendingTimers.set(normalized, timer);
}

async function handlePossibleAddition(filePath) {
  if (isStopping) {
    return;
  }

  const normalized = normalizePath(filePath);
  if (knownPaths.has(normalized)) {
    return;
  }

  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats) {
    return;
  }

  const stableStats = await waitForStableFile(filePath, fileStats);
  if (!stableStats) {
    return;
  }

  knownPaths.add(normalized);

  if (stableStats.isDirectory() && recursive) {
    await rememberChildren(filePath);
  }

  enqueueTask({
    path: filePath,
    name: path.basename(filePath),
    type: stableStats.isDirectory() ? 'directory' : 'file',
  });
}

async function scanForNewPaths(folder) {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const absolutePath = path.join(folder, entry.name);
    await handlePossibleAddition(absolutePath);

    if (recursive && entry.isDirectory()) {
      await scanForNewPaths(absolutePath);
    }
  }
}

function enqueueTask(item) {
  taskQueue.push(item);
  void runTaskQueue();
}

async function runTaskQueue() {
  if (isRunningTask) {
    return;
  }

  isRunningTask = true;

  while (taskQueue.length > 0 && !isStopping) {
    const item = taskQueue.shift();
    await runCommand(item);
  }

  isRunningTask = false;
}

function runCommand(item) {
  console.log(`[watch-folder] Added ${item.type}: ${item.path}`);
  console.log(`[watch-folder] Running: ${command}`);

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WATCH_ROOT: watchRoot,
        WATCH_PATH: item.path,
        WATCH_NAME: item.name,
        WATCH_TYPE: item.type,
        WATCH_EVENT: 'added',
      },
      shell: true,
      stdio: 'inherit',
      windowsHide: true,
    });

    child.on('error', (error) => {
      console.error(`[watch-folder] Failed to start task: ${error.message}`);
      if (exitOnError) {
        stop(1);
      }
      resolve();
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        console.error(`[watch-folder] Task stopped by signal ${signal}`);
      } else if (code !== 0) {
        console.error(`[watch-folder] Task exited with code ${code}`);
      }

      if (code !== 0 && exitOnError) {
        stop(code ?? 1);
      }

      resolve();
    });
  });
}

function stop(exitCode = 0) {
  if (isStopping) {
    return;
  }

  isStopping = true;

  for (const timer of pendingTimers.values()) {
    clearTimeout(timer);
  }

  pendingTimers.clear();
  watcher?.close();
  console.log('[watch-folder] Stopped.');
  process.exitCode = exitCode;
}

await rememberExisting(watchRoot);

try {
  watcher = watch(watchRoot, { recursive }, (eventType, fileName) => {
    if (isStopping || eventType !== 'rename') {
      return;
    }

    if (!fileName) {
      void scanForNewPaths(watchRoot);
      return;
    }

    schedulePathCheck(path.join(watchRoot, fileName.toString()));
  });
} catch (error) {
  console.error(`[watch-folder] Failed to start watcher: ${error.message}`);
  process.exit(1);
}

watcher.on('error', (error) => {
  console.error(`[watch-folder] Watcher error: ${error.message}`);
  stop(1);
});

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log(`[watch-folder] Watching: ${watchRoot}`);
console.log(`[watch-folder] Recursive: ${recursive ? 'yes' : 'no'}`);
console.log(`[watch-folder] Task: ${command}`);
