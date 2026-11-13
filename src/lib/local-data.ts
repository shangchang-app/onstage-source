/* 浏览器本机数据（V1.6）：成果、备份导出导入、旧版草稿迁移。
   - 草稿：试玩版存在 localStorage 的「onstage-free:v1」（见 static-api.ts）；正式版存在服务器。
   - 成果：单独存在「onstage-works:v1」。清理草稿不会影响成果；成果也不会自动上传或公开。
   两者都只在这台设备的这个浏览器里，换设备、清除浏览器数据、无痕模式都看不到。 */

export const DRAFT_KEY = 'onstage-free:v1';
export const WORKS_KEY = 'onstage-works:v1';
/* V1.8 轻量反馈：只存在这台设备的浏览器里，不会发送给平台（还没有接入服务器）。可以随备份导出，也可以单独导出。 */
export const FEEDBACK_KEY = 'onstage-feedback:v1';
export const BACKUP_FORMAT = 'onstage-backup';
const MAX_REVISIONS = 10;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

type Json = Record<string, any>;
export type WorkItem = { label: string; text: string };
export type WorkSection = { heading: string; items: WorkItem[] };
export type Work = {
  id: string; label: '教学模拟作品'; experienceId: string; experienceTitle: string; direction: string; outputTitle: string; contentVersion: number;
  createdAt: string; updatedAt: string; sections: WorkSection[]; before: WorkSection[] | null; revisions: { at: string; sections: WorkSection[] }[];
};

export class LocalError extends Error {
  constructor(public code: 'UNAVAILABLE' | 'QUOTA' | 'IMPORT_FORMAT' | 'IMPORT_TOO_LARGE' | 'IMPORT_EMPTY' | 'IMPORT_VERSION' | 'NOT_FOUND', message: string, public recovery: string) { super(message); }
}
const UNAVAILABLE = () => new LocalError('UNAVAILABLE', '这个浏览器现在不能使用本地存储（可能是无痕模式、关闭了网站数据，或某些应用的内置浏览器），成果没有保存。', '换用普通模式的浏览器（例如 Safari、Chrome）打开再保存；或者先用「打印 / 存为 PDF」留一份。');
const QUOTA = () => new LocalError('QUOTA', '浏览器给这个网站的存储空间满了，成果没有保存。', '先在「我的」里导出备份，再清除不需要的草稿后重试；或者先用「打印 / 存为 PDF」留一份。');
const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

function readKey(key: string): Json | null {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { throw UNAVAILABLE(); }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function writeKey(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { throw isQuota(e) ? QUOTA() : UNAVAILABLE(); }
}
const uid = () => (typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

/* ---------- 成果 ---------- */
export function readWorks(): Work[] { const d = readKey(WORKS_KEY); return Array.isArray(d?.works) ? d!.works.filter(validWork) : []; }
function writeWorks(works: Work[]) { writeKey(WORKS_KEY, { schema: 1, works }); }
export function getWork(id: string) { return readWorks().find(w => w.id === id) || null; }

/* 根据「成果结构」从用户自己的作答整理成果。只用用户写的内容，不加入参考答案。prefix='pre.' 时取「看参考前」的版本。 */
export function buildSections(g: any, answers: Record<string, unknown>, prefix = ''): WorkSection[] {
  const fields = new Map<string, any>(g.practice.flatMap((p: any) => p.fields.map((f: any) => [f.id, f])));
  return (g.output?.sections || []).map((s: any) => ({
    heading: s.heading,
    items: s.fields.map((fid: string) => {
      const v = answers[prefix + fid]; const text = Array.isArray(v) ? v.join('、') : typeof v === 'string' ? v.trim() : '';
      return { label: String(fields.get(fid)?.label || fid).replace(/^成果卡 · /, ''), text };
    }).filter((i: WorkItem) => i.text)
  }));
}
export const sameSections = (a: WorkSection[] | null, b: WorkSection[] | null) => JSON.stringify(a) === JSON.stringify(b);
export function hasBefore(answers: Record<string, unknown>) { return Object.keys(answers).some(k => k.startsWith('pre.')); }

export function saveWork(input: { experienceId: string; experienceTitle: string; direction: string; outputTitle: string; contentVersion: number; sections: WorkSection[]; before: WorkSection[] | null }): { work: Work; created: boolean; changed: boolean } {
  const works = readWorks(); const at = new Date().toISOString();
  const cur = works.find(w => w.experienceId === input.experienceId && w.contentVersion === input.contentVersion);
  if (cur) {
    const changed = !sameSections(cur.sections, input.sections) || !sameSections(cur.before, input.before);
    if (changed) { cur.revisions = [{ at: cur.updatedAt, sections: cur.sections }, ...cur.revisions].slice(0, MAX_REVISIONS); Object.assign(cur, { sections: input.sections, before: input.before ?? cur.before, updatedAt: at, experienceTitle: input.experienceTitle, outputTitle: input.outputTitle }); writeWorks(works); }
    return { work: cur, created: false, changed };
  }
  const work: Work = { id: uid(), label: '教学模拟作品', ...input, createdAt: at, updatedAt: at, revisions: [] };
  writeWorks([work, ...works]); return { work, created: true, changed: true };
}
export function deleteWork(id: string) { const works = readWorks(); if (!works.some(w => w.id === id)) throw new LocalError('NOT_FOUND', '这份成果已经不在了。', '刷新「我的」页面看看。'); writeWorks(works.filter(w => w.id !== id)); }

/* 请求浏览器尽量不要自动清理本站数据（部分浏览器支持；不支持或被拒绝时如实说明）。 */
export async function requestPersist(): Promise<'granted' | 'denied' | 'unsupported'> {
  try { const s = (navigator as any).storage; if (!s?.persist) return 'unsupported'; if (await s.persisted?.()) return 'granted'; return (await s.persist()) ? 'granted' : 'denied'; } catch { return 'unsupported'; }
}

/* ---------- 轻量反馈（V1.8） ---------- */
export const RATINGS = [['helpful', '有帮助'], ['confused', '没看懂'], ['easy', '太简单'], ['hard', '太难']] as const;
export type Rating = typeof RATINGS[number][0];
export type Feedback = { id: string; experienceId: string; experienceTitle: string; contentVersion: number; rating: Rating; reason: string; createdAt: string; updatedAt: string; sent: false };
const RATING_IDS = RATINGS.map(r => r[0]) as string[];
function validFeedback(f: any): f is Feedback { return !!f && typeof f.id === 'string' && typeof f.experienceId === 'string' && Number.isInteger(f.contentVersion) && RATING_IDS.includes(f.rating) && typeof f.reason === 'string' && f.reason.length <= 500 && typeof f.updatedAt === 'string'; }
export function readFeedback(): Feedback[] { const d = readKey(FEEDBACK_KEY); return Array.isArray(d?.items) ? d!.items.filter(validFeedback) : []; }
function writeFeedback(items: Feedback[]) { writeKey(FEEDBACK_KEY, { schema: 1, note: '只保存在本机，没有发送给平台', items }); }
export function getFeedback(experienceId: string, contentVersion: number) { return readFeedback().find(f => f.experienceId === experienceId && f.contentVersion === contentVersion) || null; }
/* 同一个体验的同一个版本只留一条：再保存就是修改（原来的提交时间保留）。 */
export function saveFeedback(input: { experienceId: string; experienceTitle: string; contentVersion: number; rating: Rating; reason: string }): Feedback {
  if (!RATING_IDS.includes(input.rating)) throw new LocalError('IMPORT_FORMAT', '请选择一项反馈。', '在「有帮助 / 没看懂 / 太简单 / 太难」里选一项。');
  const items = readFeedback(); const at = new Date().toISOString(); const reason = input.reason.trim().slice(0, 500);
  const cur = items.find(f => f.experienceId === input.experienceId && f.contentVersion === input.contentVersion);
  if (cur) { Object.assign(cur, { rating: input.rating, reason, experienceTitle: input.experienceTitle, updatedAt: at }); writeFeedback(items); return cur; }
  const f: Feedback = { id: uid(), ...input, reason, createdAt: at, updatedAt: at, sent: false };
  writeFeedback([f, ...items]); return f;
}
export function exportFeedback() { return { format: 'onstage-feedback', version: 1, exportedAt: new Date().toISOString(), note: 'on stage 本机反馈：只保存在这台设备上，没有发送给平台。你可以把这个文件发给我们。', items: readFeedback() }; }

/* ---------- 备份 ---------- */
export function exportBackup() {
  const draftsDb = (() => { try { return readKey(DRAFT_KEY); } catch { return null; } })();
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), note: 'on stage 本机备份：包含成果和这个浏览器里的草稿。教学模拟作品，不是实习经历或能力认证。', works: readWorks(), drafts: draftsDb?.drafts ? Object.values(draftsDb.drafts) : [], feedback: (() => { try { return readFeedback(); } catch { return []; } })() };
}
function validSections(x: unknown): x is WorkSection[] { return Array.isArray(x) && x.every(s => s && typeof s.heading === 'string' && Array.isArray(s.items) && s.items.every((i: any) => i && typeof i.label === 'string' && typeof i.text === 'string')); }
function validWork(w: any): w is Work { return !!w && typeof w.id === 'string' && typeof w.experienceId === 'string' && typeof w.experienceTitle === 'string' && Number.isInteger(w.contentVersion) && typeof w.updatedAt === 'string' && validSections(w.sections) && (w.before === null || w.before === undefined || validSections(w.before)) && Array.isArray(w.revisions ?? []); }
function validDraft(d: any) { return !!d && typeof d.content_id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(d.content_id) && Number.isInteger(d.content_version) && d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers); }

export function importBackup(text: string) {
  if (text.length > MAX_IMPORT_BYTES) throw new LocalError('IMPORT_TOO_LARGE', '文件太大（超过 5 MB），不像是 on stage 的备份文件。', '请选择从「我的 → 导出备份」得到的 .json 文件。');
  let data: any; try { data = JSON.parse(text); } catch { throw new LocalError('IMPORT_FORMAT', '这个文件不是有效的备份文件（无法读取）。', '请选择从「我的 → 导出备份」得到的 .json 文件，不要用其他软件修改它。'); }
  if (data?.format !== BACKUP_FORMAT) throw new LocalError('IMPORT_FORMAT', '这个文件不是 on stage 的备份文件。', '请选择从「我的 → 导出备份」得到的 .json 文件。');
  if (data.version !== 1) throw new LocalError('IMPORT_VERSION', '这个备份来自不认识的版本，暂时不能导入。', '请用同一版本的网站导出备份，或联系我们。');
  const works = Array.isArray(data.works) ? data.works : [], drafts = Array.isArray(data.drafts) ? data.drafts : [], feedback = Array.isArray(data.feedback) ? data.feedback : []; // V1.8 以前的备份没有 feedback
  const goodWorks = works.filter(validWork), goodDrafts = drafts.filter(validDraft), goodFeedback = feedback.filter(validFeedback);
  if (!goodWorks.length && !goodDrafts.length && !goodFeedback.length) throw new LocalError('IMPORT_EMPTY', works.length || drafts.length || feedback.length ? '备份里的内容格式不对，没有可以导入的成果、草稿或反馈。' : '这个备份里没有成果或草稿。', '确认选对了文件；现有的成果和草稿都没有被改动。');
  // 先算好结果，最后一次性写入：任何一步失败，现有数据都不变。
  const current = readWorks(); let added = 0, updated = 0, kept = 0;
  for (const w of goodWorks as Work[]) {
    const same = current.find(x => x.id === w.id) || current.find(x => x.experienceId === w.experienceId && x.contentVersion === w.contentVersion);
    if (!same) { current.push({ ...w, label: '教学模拟作品', before: w.before ?? null, revisions: (w.revisions || []).filter((r: any) => validSections(r?.sections)).slice(0, MAX_REVISIONS) }); added++; }
    else if (w.updatedAt > same.updatedAt) { same.revisions = [{ at: same.updatedAt, sections: same.sections }, ...same.revisions].slice(0, MAX_REVISIONS); Object.assign(same, { sections: w.sections, before: w.before ?? same.before, updatedAt: w.updatedAt }); updated++; }
    else kept++;
  }
  let draftsAdded = 0, draftsSkipped = 0;
  const db = (readKey(DRAFT_KEY) || { owner: 'local:' + uid(), drafts: {}, recoveries: [], schema: 2 }) as Json;
  db.drafts = db.drafts || {}; db.recoveries = db.recoveries || [];
  for (const d of goodDrafts) {
    if (db.drafts[d.content_id]) { draftsSkipped++; continue; }
    db.drafts[d.content_id] = { owner: db.owner, content_id: d.content_id, version: 1, content_version: d.content_version, answers: d.answers, conflict: 0, conflict_with: null, saved_at: typeof d.saved_at === 'string' ? d.saved_at : new Date().toISOString(), progress: d.progress && typeof d.progress === 'object' ? d.progress : {} };
    draftsAdded++;
  }
  // 反馈：同一个体验同一版本保留较新的一条
  const fb = goodFeedback.length ? readFeedback() : []; let feedbackAdded = 0;
  for (const f of goodFeedback as Feedback[]) {
    const same = fb.find(x => x.id === f.id) || fb.find(x => x.experienceId === f.experienceId && x.contentVersion === f.contentVersion);
    if (!same) { fb.push({ ...f, experienceTitle: String(f.experienceTitle || ''), createdAt: f.createdAt || f.updatedAt, sent: false }); feedbackAdded++; }
    else if (f.updatedAt > same.updatedAt) { Object.assign(same, { rating: f.rating, reason: f.reason, updatedAt: f.updatedAt }); feedbackAdded++; }
  }
  current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeWorks(current); if (draftsAdded) writeKey(DRAFT_KEY, db); if (feedbackAdded) writeFeedback(fb);
  return { added, updated, kept, draftsAdded, draftsSkipped, feedbackAdded, skippedBad: works.length - goodWorks.length + drafts.length - goodDrafts.length + feedback.length - goodFeedback.length };
}

/* ---------- 旧版草稿迁移 ----------
   V1.4.1（线上旧版）里，ops-returns 是 6 步引导体验，作答字段是 p1.*–p6.*。
   V1.5 起 ops-returns 改为短体验，原 6 步体验改名为 ops-returns-deep。
   升级时把旧的 6 步草稿、可恢复作答、本机暂存和「感受」复制一份到 ops-returns-deep。
   原来的数据留在原处不删（只把原草稿的步骤号重置为第 1 步，避免短体验打开到奇怪的位置），
   所以回滚到 V1.4.1 时，旧版仍能读到原来的作答。迁移只做一次（schema 记为 2）。 */
export const OLD_ID = 'ops-returns', DEEP_ID = 'ops-returns-deep';
const isSixStep = (answers: unknown) => !!answers && typeof answers === 'object' && Object.keys(answers as Json).some(k => /^p[1-6]\./.test(k));
export function migrateDraftDb(db: Json): boolean {
  if (!db || (db.schema ?? 1) >= 2) return false;
  db.drafts = db.drafts || {}; db.recoveries = db.recoveries || [];
  const old = db.drafts[OLD_ID];
  if (old && isSixStep(old.answers)) {
    const copy = JSON.parse(JSON.stringify({ ...old, content_id: DEEP_ID, conflict: 0, conflict_with: null }));
    if (!db.drafts[DEEP_ID]) db.drafts[DEEP_ID] = copy;
    else db.recoveries.push({ id: uid(), owner: db.owner, content_id: DEEP_ID, content_version: old.content_version, answers: copy.answers, reason: '升级时保留的旧版作答', created_at: new Date().toISOString() });
    old.progress = { ...(old.progress || {}), step: 0 };
  }
  for (const r of [...db.recoveries]) if (r.content_id === OLD_ID && isSixStep(r.answers)) db.recoveries.push({ ...JSON.parse(JSON.stringify(r)), id: uid(), content_id: DEEP_ID });
  db.schema = 2; return true;
}
export function migrateLocalKeys() {
  try {
    if (localStorage.getItem('onstage:migrated:v16') === '1') return;
    const refOld = 'onstage:reflection:' + OLD_ID, refNew = 'onstage:reflection:' + DEEP_ID;
    const r = localStorage.getItem(refOld);
    if (r && !localStorage.getItem(refNew)) { const v = JSON.parse(r); if ((v?.reflection?.likes || []).some((l: string) => /6 周的运营数据|一页给主管/.test(l)) || v?.reflection?.understand) localStorage.setItem(refNew, r); }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!; const m = k.match(/^onstage:backup:(.+):ops-returns$/);
      if (!m) continue; const v = JSON.parse(localStorage.getItem(k) || 'null');
      const nk = `onstage:backup:${m[1]}:${DEEP_ID}`; if (v && isSixStep(v.answers) && !localStorage.getItem(nk)) localStorage.setItem(nk, JSON.stringify(v));
    }
    localStorage.setItem('onstage:migrated:v16', '1');
  } catch { /* 存储不可用时跳过，不影响使用 */ }
}

/* 只删除草稿（和它的可恢复作答），不动成果。 */
export function discardDraft(id: string) {
  const db = readKey(DRAFT_KEY); if (!db?.drafts?.[id]) throw new LocalError('NOT_FOUND', '这份草稿已经不在了。', '刷新页面看看。');
  delete db.drafts[id]; db.recoveries = (db.recoveries || []).filter((r: Json) => r.content_id !== id); writeKey(DRAFT_KEY, db);
  try { localStorage.removeItem('onstage:reflection:' + id); for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i)!; if (k.startsWith('onstage:backup:') && k.endsWith(':' + id)) localStorage.removeItem(k); } } catch { /* ignore */ }
}
