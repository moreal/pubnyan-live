#!/usr/bin/env node
// Builds storybook, serves the static output, and for every id in EXPECTED_STORY_IDS asserts
// that the story exists in the built index and renders something other than a blank canvas.
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';

export const EXPECTED_STORY_IDS = ['targets-svg--player', 'targets-svg--gallery'];

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STORYBOOK_DIR = join(ROOT, 'dist', 'storybook');
const PORT = 6008;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
};

function main() {
  console.log('building storybook...');
  const build = spawnSync('npm', ['run', 'storybook:build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('storybook build failed');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path === '/' || path === '') path = '/index.html';
    const filePath = join(STORYBOOK_DIR, path);
    if (!filePath.startsWith(STORYBOOK_DIR) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    createReadStream(filePath).pipe(res);
  });

  server.listen(PORT, () => run(server));
}

async function run(server) {
  let exitCode = 0;
  let browser;
  try {
    const indexRaw = await readFile(join(STORYBOOK_DIR, 'index.json'), 'utf8');
    const index = JSON.parse(indexRaw);
    const knownIds = new Set(Object.keys(index.entries ?? {}));

    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });

    for (const id of EXPECTED_STORY_IDS) {
      try {
        if (!knownIds.has(id)) {
          throw new Error(`story id "${id}" not found in dist/storybook/index.json`);
        }
        await page.goto(`http://localhost:${PORT}/iframe.html?id=${id}&viewMode=story`, {
          waitUntil: 'networkidle0',
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const screenshot = await page.screenshot({ type: 'png' });
        if (isUniformColor(screenshot)) {
          throw new Error('canvas is uniformly one colour');
        }
        console.log(`${id}: OK`);
      } catch (err) {
        console.log(`${id}: FAILED - ${err instanceof Error ? err.message : String(err)}`);
        exitCode = 1;
        break;
      }
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exit(exitCode);
}

function isUniformColor(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  const { data } = png;
  const [r0, g0, b0, a0] = data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0 || data[i + 3] !== a0) {
      return false;
    }
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
