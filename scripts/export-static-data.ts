/* 生成试玩版用的内容数据（static-data.json）：在临时数据库里写入演示内容，导出学生能看到的部分。
   不包含任何确认依据、授权依据等后台信息；不包含任何人的作答。
   用法：tsx scripts/export-static-data.ts 输出文件 [参数文件] */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/db';
import { Service } from '../src/server/service';
import { seed } from './seed';
const [out, paramsOut] = process.argv.slice(2);
if (!out) { console.error('用法：tsx scripts/export-static-data.ts 输出文件 [参数文件]'); process.exit(2); }
const store = new Store(join(mkdtempSync(join(tmpdir(), 'onstage-static-')), 'static.sqlite')); seed(store);
const svc = new Service(store);
const ids = store.all<{ id: string; kind: string }>('SELECT id, kind FROM content ORDER BY id');
const visitor = { owner: 'static-export', userId: null, stamp: 'static', role: 'student' as const };
const content: Record<string, unknown> = {}, guides: Record<string, unknown> = {};
for (const { id, kind } of ids) { content[id] = svc.publicContent(id); if (kind === 'experience') guides[id] = svc.guide(visitor, id); }
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), list: svc.list(), content, guides }));
const section: Record<string, string> = { job: 'jobs', event: 'events', experience: 'experiences', company: 'companies' };
if (paramsOut) writeFileSync(paramsOut, JSON.stringify({ details: ids.map(x => ({ section: section[x.kind], id: x.id })), experiences: ids.filter(x => x.kind === 'experience').map(x => ({ section: 'experiences', id: x.id })) }));
console.log(`已导出 ${ids.length} 项演示内容`);
store.db.close();
