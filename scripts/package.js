#!/usr/bin/env node
// Zips exactly what the Chrome Web Store needs to load and run the
// extension: manifest.json, the icons it references, and src/. Nothing
// else — no docs, no tests, no package.json, no tmp/, no dotfiles.
//
// Cross-platform replacement for the old PowerShell-only package.sh:
// uses Node's built-in zlib on every OS instead of Compress-Archive, so
// `npm run package` also works in CI and on Linux/macOS.

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const OUT = `tab-vacuum-${manifest.version}.zip`;
const STAGE = join(ROOT, 'tmp', 'package');

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

cpSync(join(ROOT, 'manifest.json'), join(STAGE, 'manifest.json'));
for (const icon of ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png']) {
  cpSync(join(ROOT, icon), join(STAGE, icon));
}
cpSync(join(ROOT, 'src'), join(STAGE, 'src'), { recursive: true });

const outPath = join(ROOT, OUT);
rmSync(outPath, { force: true });
writeZip(STAGE, outPath);

console.log('Packaged files:');
for (const file of listFiles(STAGE).sort()) {
  console.log(`  ${relative(STAGE, file).split('\\').join('/')}`);
}

rmSync(STAGE, { recursive: true, force: true });

console.log(`\nWrote ${OUT}`);

/** Every regular file under `dir`, recursively. */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * A minimal, dependency-free ZIP writer: one stored (uncompressed) entry per
 * file, which keeps this a few dozen lines instead of vendoring a zip
 * library. The store build is a few hundred KB either way.
 */
function writeZip(stageDir, outPath) {
  const files = listFiles(stageDir).sort();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(relative(stageDir, file).split('\\').join('/'), 'utf8');
    const data = readFileSync(file);
    const crc = crc32(data);
    const { time, date } = dosDateTime(statSync(file).mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(outPath, Buffer.concat([...localParts, centralBuf, end]));
}

function dosDateTime(mtime) {
  const time =
    ((mtime.getHours() & 0x1f) << 11) | ((mtime.getMinutes() & 0x3f) << 5) | ((mtime.getSeconds() >> 1) & 0x1f);
  const date =
    (((mtime.getFullYear() - 1980) & 0x7f) << 9) | (((mtime.getMonth() + 1) & 0xf) << 5) | (mtime.getDate() & 0x1f);
  return { time, date };
}

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}
