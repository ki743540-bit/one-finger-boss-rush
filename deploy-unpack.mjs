import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateSync } from 'node:zlib';

const packed = readFileSync(new URL('./game-forge-package.b64', import.meta.url), 'utf8').trim();
const files = JSON.parse(inflateSync(Buffer.from(packed, 'base64')).toString('utf8'));
let count = 0;
for (const [file, value] of Object.entries(files)) {
  if (file.startsWith('/') || file.split('/').includes('..') || !/^[a-zA-Z0-9._/-]+$/.test(file)) throw new Error('Unsafe package path');
  const target = join('game-forge-studio', file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === 'string' ? value : Buffer.from(value.base64, 'base64'));
  count++;
}
console.log('Game Forge assets verified and restored:', count);
