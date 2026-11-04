import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// A release includes the preferred source for the separately replaceable LGPL library.
export async function collectReleaseSources(destination) {
 const manifest = JSON.parse(await fs.readFile('licenses/sources.json', 'utf8'));
 const cache = 'build/vendor-sources';
 await fs.mkdir(cache, { recursive: true });
 const target = path.join(destination, 'licenses', 'sources');
 await fs.mkdir(target, { recursive: true });
 for (const source of manifest) {
  const installed = JSON.parse(await fs.readFile(path.join('node_modules', source.package, 'package.json'), 'utf8'));
  if (installed.version !== source.version) throw new Error('Corresponding source version needs updating: ' + source.package);
  if (path.basename(source.file) !== source.file || !source.url.startsWith('https://')) throw new Error('Invalid source manifest');
  const cached = path.join(cache, source.file);
  let bytes;
  try { bytes = await fs.readFile(cached); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes || digest(bytes) !== source.sha256) {
   const response = await fetch(source.url, { signal: AbortSignal.timeout(60000) });
   if (!response.ok) throw new Error(`Source download failed: ${source.name} (${response.status})`);
   bytes = Buffer.from(await response.arrayBuffer());
   if (digest(bytes) !== source.sha256) throw new Error('Source checksum mismatch: ' + source.name);
   await fs.writeFile(cached, bytes);
  }
  await fs.writeFile(path.join(target, source.file), bytes);
 }
 await fs.copyFile('licenses/SOURCES.md', path.join(target, 'README.md'));
}
