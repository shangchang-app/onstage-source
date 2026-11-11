/* 免费试玩版（GitHub Pages 等纯静态托管）用的「本机接口」。
   静态托管没有服务器，所以在浏览器里接管 /api/* 请求：
   - 内容（岗位体验、机会库、企业）来自打包时生成的 static-data.json，全部是演示内容；
   - 草稿、浏览进度、可恢复的作答保存在本机浏览器（localStorage），只有这个浏览器能看到；
   - 登录、完成记录、收藏、反馈、合作表单在试玩版里不可用，返回明确的提示。
   保存规则与正式版的访客模式一致（版本号检查、冲突时两份都保留），所以作答页的提示和冲突处理照常工作。 */
import { hasContent, requiredStatus, sameAnswers } from '../server/validation';
import { DRAFT_KEY, migrateDraftDb, migrateLocalKeys } from './local-data';

type Json = Record<string, any>;
type Draft = { owner: string; content_id: string; version: number; content_version: number; answers: Json; conflict: 0 | 1; conflict_with: string | null; saved_at: string; progress: Json };
type Recovery = { id: string; owner: string; content_id: string; content_version: number; answers: Json; reason: string; created_at: string };
type Db = { owner: string; drafts: Record<string, Draft>; recoveries: Recovery[]; schema?: number };

const KEY = DRAFT_KEY;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** 本机保存的有效期说明：部分浏览器（如 iPhone 上的 Safari）会清理 7 天没有访问的网站数据，所以只承诺 7 天。 */
const KEEP_DAYS = 7;

class Fail extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const now = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

let dataPromise: Promise<Json> | null = null;
const data = () => (dataPromise ??= fetch(BASE + '/static-data.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Fail(503, 'DATA', '内容加载失败，请检查网络后刷新'); return r.json(); }));

let memory: Db | null = null; // 浏览器不能保存数据时，只在当前页面内存里保留身份（不会假装已保存作答）
function load(): Db {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { raw = null; }
  if (raw) { const db = JSON.parse(raw) as Db; if (migrateDraftDb(db)) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 迁移结果下次再保存 */ } } return db; }
  const db = memory || { owner: 'local:' + uid(), drafts: {}, recoveries: [], schema: 2 };
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { memory = db; }
  return db;
}
function save(db: Db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { throw new Fail(507, 'STORAGE', '这个浏览器不能保存数据（可能是隐私模式或空间已满），作答无法保存'); }
}
/* 截止日期在打包后会继续过去：每次读取时重新判断「已截止」。 */
function fresh(c: Json) {
  if (c && c.status === 'published' && c.data?.deadline && Date.parse(c.data.deadline) <= Date.now()) return { ...c, status: 'expired' };
  return c;
}
async function content(id: string) { const d = await data(); const c = d.content[id]; if (!c) throw new Fail(404, 'NOT_FOUND', '内容不存在'); return fresh(c); }
async function guideOf(id: string) {
  const d = await data(); const g = d.guides[id];
  if (!g || g.unavailable) throw new Fail(409, 'UNAVAILABLE', '体验已下线，不能继续保存或提交，原作答仍保留');
  return g;
}
function draftOut(db: Db, id: string) {
  const d = db.drafts[id]; if (!d) return null;
  const mine = db.recoveries.filter(r => r.content_id === id);
  const conflictWith = d.conflict ? (mine.find(r => r.id === d.conflict_with) || mine[mine.length - 1] || null) : null;
  return { ...d, conflictWith };
}
function archive(db: Db, id: string, contentVersion: number, answers: Json, reason: string) {
  const r: Recovery = { id: uid(), owner: db.owner, content_id: id, content_version: contentVersion, answers, reason, created_at: now() };
  db.recoveries.push(r); return r.id;
}
function mergeProgress(a: Json = {}, b: Json = {}) {
  const arr = (x: unknown) => Array.isArray(x) ? x : [];
  return { step: Number.isInteger(b.step) ? b.step : (a.step ?? 0), visited: [...new Set([...arr(a.visited), ...arr(b.visited)])].sort(), referenceViewed: !!(a.referenceViewed || b.referenceViewed), hintsOpened: [...new Set([...arr(a.hintsOpened), ...arr(b.hintsOpened)])].slice(0, 40) };
}

async function route(path: string, method: string, body: Json | null) {
  const parts = path.split('/').filter(Boolean);
  if (method === 'GET') {
    if (path === 'health') return { ok: true };
    if (path === 'session') { const db = load(); return { identity: { owner: db.owner, userId: null, stamp: 'local', role: 'student' }, mock: false, loginAvailable: false, sessionDays: KEEP_DAYS, staticTrial: true }; }
    if (path === 'content') { const d = await data(); return (d.list as Json[]).map(fresh).filter(c => ['published', 'expired'].includes(c.status)); }
    if (parts[0] === 'content' && parts.length === 2) return content(parts[1]);
    if (parts[0] === 'experiences' && parts[2] === 'guide') { const d = await data(); const g = d.guides[parts[1]]; if (!g) throw new Fail(404, 'NOT_FOUND', '体验不存在'); return g; }
    if (parts[0] === 'drafts' && parts.length === 2) return draftOut(load(), parts[1]);
    if (path === 'mine') {
      const db = load(); const d = await data();
      const drafts = Object.values(db.drafts).sort((a, b) => b.saved_at.localeCompare(a.saved_at)).map(dr => {
        const g = d.guides[dr.content_id]; const s = g && !g.unavailable ? requiredStatus(g.data, dr.answers as any) : null;
        return { contentId: dr.content_id, version: dr.version, contentVersion: dr.content_version, savedAt: dr.saved_at, conflict: !!dr.conflict, progress: dr.progress, answered: s ? { done: s.done, total: s.total } : null, outdated: false, content: fresh(d.content[dr.content_id] || { id: dr.content_id, status: 'offline', data: { title: '这项内容暂不可用' } }) };
      });
      return { drafts, recoveries: [...db.recoveries].reverse().map(r => ({ ...r, title: d.content[r.content_id]?.data?.title || '体验' })), favorites: [], records: [] };
    }
    if (parts[0] === 'records') throw new Fail(401, 'LOGIN_REQUIRED', '试玩版不保存完成记录');
    if (path === 'admin' || parts[0] === 'admin') throw new Fail(403, 'FORBIDDEN', '试玩版没有后台');
  } else {
    if (parts[0] === 'drafts' && parts.length === 2) {
      const id = parts[1]; const b = body || {}; const g = await guideOf(id); const db = load();
      if (!Number.isInteger(b.version) || !Number.isInteger(b.contentVersion) || typeof b.answers !== 'object') throw new Fail(422, 'VALIDATION', '请求格式不正确');
      if (b.contentVersion !== g.version) throw new Fail(409, 'CONTENT_CHANGED', '体验内容已更新，请重新打开体验');
      const cur = db.drafts[id];
      if (cur?.conflict) { archive(db, id, b.contentVersion, b.answers, '草稿冲突待处理时写的作答'); save(db); throw new Fail(409, 'DRAFT_CONFLICT', '草稿发生冲突，两份内容都已保留，请选择要继续的版本'); }
      if (cur && cur.version !== b.version) {
        if (sameAnswers(cur.answers as any, b.answers)) { cur.progress = mergeProgress(cur.progress, b.progress ?? cur.progress); save(db); return draftOut(db, id); }
        if (!hasContent(cur.answers as any)) { Object.assign(cur, { answers: b.answers, progress: mergeProgress(cur.progress, b.progress ?? cur.progress), version: cur.version + 1, saved_at: now() }); save(db); return draftOut(db, id); }
        // 同一个浏览器开了两个页面同时修改：两份都保留，标记冲突，让用户选择。
        const rid = archive(db, id, b.contentVersion, b.answers, '另一个页面同时修改时保留的作答');
        Object.assign(cur, { conflict: 1, conflict_with: rid, version: cur.version + 1 }); save(db);
        throw new Fail(409, 'DRAFT_CONFLICT', '草稿发生冲突，两份内容都已保留，请选择要继续的版本');
      }
      db.drafts[id] = { owner: db.owner, content_id: id, version: b.version + 1, content_version: b.contentVersion, answers: b.answers, conflict: 0, conflict_with: null, saved_at: now(), progress: mergeProgress(cur?.progress, b.progress ?? cur?.progress) };
      save(db); return draftOut(db, id);
    }
    if (parts[0] === 'drafts' && parts[2] === 'resolve') {
      const id = parts[1]; const b = body || {}; const db = load(); const cur = db.drafts[id];
      if (!cur || cur.version !== b.version) throw new Fail(409, 'DRAFT_CONFLICT', '草稿已变化，请刷新后重新选择');
      if (b.recoveryId) {
        const other = db.recoveries.find(r => r.id === b.recoveryId && r.content_id === id); if (!other) throw new Fail(404, 'NOT_FOUND', '恢复副本不存在');
        archive(db, id, cur.content_version, cur.answers, '选择另一份作答前的草稿');
        Object.assign(cur, { answers: other.answers, content_version: other.content_version, version: cur.version + 1, conflict: 0, conflict_with: null, saved_at: now() });
        db.recoveries = db.recoveries.filter(r => r.id !== other.id);
      } else Object.assign(cur, { conflict: 0, conflict_with: null, version: cur.version + 1 });
      save(db); return draftOut(db, id);
    }
    if (parts[0] === 'recoveries' && parts[2] === 'restore') {
      const db = load(); const r = db.recoveries.find(x => x.id === parts[1]); if (!r) throw new Fail(404, 'NOT_FOUND', '恢复副本不存在');
      const g = await guideOf(r.content_id); if (r.content_version !== g.version) throw new Fail(409, 'CONTENT_CHANGED', '这份作答对应的是旧版本内容，只能查看，不能直接恢复');
      const cur = db.drafts[r.content_id]; if (cur?.conflict) throw new Fail(409, 'DRAFT_CONFLICT', '请先处理这个体验的草稿冲突');
      if (cur) { archive(db, r.content_id, cur.content_version, cur.answers, '恢复其他作答前的草稿'); Object.assign(cur, { answers: r.answers, content_version: r.content_version, version: cur.version + 1, saved_at: now() }); }
      else db.drafts[r.content_id] = { owner: db.owner, content_id: r.content_id, version: 1, content_version: r.content_version, answers: r.answers, conflict: 0, conflict_with: null, saved_at: now(), progress: {} };
      db.recoveries = db.recoveries.filter(x => x.id !== r.id); save(db); return draftOut(db, r.content_id);
    }
    if (parts[0] === 'recoveries' && parts[2] === 'delete') {
      const db = load(); const before = db.recoveries.length; db.recoveries = db.recoveries.filter(x => x.id !== parts[1]);
      if (db.recoveries.length === before) throw new Fail(404, 'NOT_FOUND', '恢复副本不存在'); save(db); return { ok: true };
    }
    if (parts[0] === 'apply') {
      const c = await content(parts[1]); if (!['job', 'event'].includes(c.kind) || c.status !== 'published') throw new Fail(409, 'UNAVAILABLE', '该机会已截止或下架，无法继续');
      return { demo: true, message: '这是示例信息，仅演示投递流程：不会发送邮件，也不会跳转到真实招聘页面。上场不会把这次点击记为「已投递」。' };
    }
    if (parts[0] === 'experiences' && parts[2] === 'submit') throw new Fail(401, 'LOGIN_REQUIRED', '试玩版暂不保存完成记录，你的作答仍保存在这个浏览器里');
    if (parts[0] === 'favorites') throw new Fail(401, 'LOGIN_REQUIRED', '试玩版暂不支持收藏');
    if (parts[0] === 'reports' || path === 'cooperation') throw new Fail(503, 'TRIAL', '试玩版暂不支持在线提交');
    if (parts[0] === 'auth') throw new Fail(503, 'AUTH_CONFIG', '试玩版暂未开放登录');
    if (parts[0] === 'admin') throw new Fail(403, 'FORBIDDEN', '试玩版没有后台');
  }
  throw new Fail(404, 'NOT_FOUND', '接口不存在');
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 接管浏览器里发往 /api/* 的请求。只在试玩版（NEXT_PUBLIC_STATIC=1）里调用。 */
export function installStaticApi() {
  const w = window as unknown as { __onstageStatic?: boolean };
  if (w.__onstageStatic) return; w.__onstageStatic = true;
  migrateLocalKeys();
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    const prefix = [BASE + '/api/', '/api/'].find(p => url.origin === window.location.origin && url.pathname.startsWith(p));
    if (!prefix) return original(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body: Json | null = null;
    if (method !== 'GET' && init?.body) { try { body = JSON.parse(String(init.body)); } catch { return json({ error: '请求格式不正确', code: 'JSON' }, 400); } }
    try { return json(await route(url.pathname.slice(prefix.length), method, body)); }
    catch (e) {
      if (e instanceof Fail) return json({ error: e.message, code: e.code }, e.status);
      return json({ error: '暂时无法完成操作，请保留内容并重试', code: 'INTERNAL' }, 500);
    }
  };
}
