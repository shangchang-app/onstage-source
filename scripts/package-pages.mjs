#!/usr/bin/env node
/* 把 dist-pages/ 打成发布包 release/onstage-site-<版本>-<提交>.zip，并写出 SHA256。
   用法：npm run build:static && npm run package:pages
   发布包根目录直接是网站文件（index.html、_next/、version.json……），GitHub Pages 发布流程会把它解压到网站根目录。
   zip 内文件按路径排序、时间固定，同样的网站文件会得到同样的校验值。 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-pages');
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'version.json'))) { console.error('没有找到 dist-pages/index.html 或 version.json，请先运行 npm run build:static'); process.exit(2); }
const ver = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'));
const files = []; (function walk(d) { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(p); } })(dist);

/* 最小 zip 写入（deflate），不依赖系统 zip 命令，Windows / macOS / Linux 都能用 */
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 固定为 2026-01-01 00:00
const parts = [], central = []; let offset = 0;
for (const f of files) {
  const name = Buffer.from(relative(dist, f).split('\\').join('/'), 'utf8'); const data = readFileSync(f); const comp = deflateRawSync(data, { level: 9 }); const crc = crc32(data);
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
  parts.push(h, name, comp);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, name); offset += h.length + name.length + comp.length;
}
const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, cd, end]);
const out = join(root, 'release'); mkdirSync(out, { recursive: true });
const name = `onstage-site-${ver.version}-${ver.commit}.zip`; writeFileSync(join(out, name), zip);
const sha = createHash('sha256').update(zip).digest('hex');
writeFileSync(join(out, name + '.sha256'), `${sha}  ${name}\n`);
writeFileSync(join(out, 'release.json'), JSON.stringify({ file: name, sha256: sha, bytes: zip.length, files: files.length, ...ver }, null, 2) + '\n');
console.log(`[package] ${name}\n[package] 文件 ${files.length} 个，${zip.length} 字节\n[package] SHA256 ${sha}\n[package] 版本 ${ver.version} · 提交 ${ver.commit} · 构建 ${ver.builtAt}`);
