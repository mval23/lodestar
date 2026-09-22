#!/usr/bin/env node
// Renders the brand's app-icon tiles to the PNG sizes the platforms ask for:
//
//   node scripts/brand/make-icons.mjs
//
// iOS will not take an SVG for a home-screen icon, so these have to exist as
// files. They are generated, not drawn: the mark stays exactly what
// brand/logo/app-icon-*.svg says it is (BRAND.md §4 — never redraw it).
//
// Chromium comes with Playwright, which the repository already has.

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'public');

// Light tiles everywhere: a home-screen icon cannot follow the system theme,
// and the Stone tile is the one the brand leads with.
const TILES = [
  { source: 'app-icon-light.svg', file: 'apple-touch-icon.png', size: 180 },
  { source: 'app-icon-light.svg', file: 'icon-192.png', size: 192 },
  { source: 'app-icon-light.svg', file: 'icon-512.png', size: 512 },
  { source: 'app-icon-dark.svg', file: 'icon-dark-512.png', size: 512 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const tile of TILES) {
  const svg = await readFile(path.join(root, 'brand', 'logo', tile.source), 'utf8');
  await page.setViewportSize({ width: tile.size, height: tile.size });
  // The tile is square and edge to edge; each platform applies its own mask.
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0}svg{display:block;width:${tile.size}px;height:${tile.size}px}</style>${svg}`,
  );
  const png = await page.locator('svg').screenshot({ omitBackground: false });
  await writeFile(path.join(out, tile.file), png);
  console.log(`${tile.file}  ${tile.size}×${tile.size}`);
}

await browser.close();
