import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store, now } from './db';
import { type Identity } from './auth';
import { answersSchema, checkGuide, contentSchema, demand, editSchema, Problem, progressSchema, reflectionSchema, requiredStatus, sameAnswers, hasContent, validateDestination, type ContentData, type Kind, type Progress } from './validation';
export type Content = {id:string;kind:Kind;companyId:string|null;state:string;version:number;confirmedVersion:number|null;confirmation:string;demo:boolean;data:ContentData;updatedAt:string;status:string};
const STEP_NAMES = ['认识岗位','看一次示范','接到模拟任务','跟着尝试','对照参考思路','总结与下一步'];
const QUICK_STEP_NAMES = ['收到任务','看材料','行动与理由','复盘'];

export class Service {
  constructor(public store: Store) {}
  content(id: string): Content {
    const row = this.store.get('SELECT * FROM content WHERE id=?',id);
    demand(row,404,'NOT_FOUND','内容不存在');
    const c: Content = {id:row.id,kind:row.kind,companyId:row.company_id,state:row.state,version:row.version,confirmedVersion:row.confirmed_version,confirmation:row.confirmation,demo:!!row.demo,data:JSON.parse(row.data),updatedAt:row.updated_at,status:row.state};
    /* 公开状态分两步判断，顺序不能颠倒：
       1. 是否允许公开：内容本身已发布、企业授权有效且企业在展示中、岗位当前版本已获企业确认。任一不满足即停止展示。
       2. 只有允许公开的内容，才继续判断是否已截止；已截止只关闭报名 / 投递，不会让被停止展示的内容重新公开。 */
    const blocked = this.blockedReason(c);
    if (blocked) c.status = blocked;
    else if (c.data.deadline && Date.parse(c.data.deadline) <= Date.now()) c.status = 'expired';
    return c;
  }
  /* 不允许公开的原因：草稿 / 待确认 / 下架，或企业未授权、企业不在展示中、岗位当前版本未确认。null 表示允许公开。 */
  blockedReason(c: Content): string | null {
    if (c.state !== 'published') return c.state;
    if (c.kind === 'company' && !c.data.authorized) return 'offline';
    if (c.companyId) { const co = this.content(c.companyId); if (co.status !== 'published') return 'offline'; }
    if (c.kind === 'job' && c.confirmedVersion !== c.version) return 'pending';
    return null;
  }
  /* 公开数据：不含企业确认依据、授权依据、简版任务的参考答案和引导式体验的完整步骤（完整步骤走 guide 接口）。 */
  publicContent(id: string) {
    const c = this.content(id);
    if (c.status !== 'published' && c.status !== 'expired') {
      // Old links retain the same unavailable state without exposing unconfirmed edits.
      return {id:c.id,kind:c.kind,status:c.status,demo:c.demo,data:{title:'这项内容暂不可用'}};
    }
    const {confirmation: _confirmation,...safe} = c;
    const { guide, ...rest } = c.data;
    const summary = guide ? { quick: !!guide.quick, deep: guide.quick?.deep || '', output: guide.output?.title || '', lessons: guide.lessons.map(l => l.title), transfer: guide.practice.some(p => p.when === 'transfer'), review: guide.review, provenance: guide.provenance.length ? guide.provenance : (guide.quick?.provenance || []), steps: guide.quick ? QUICK_STEP_NAMES : STEP_NAMES, practice: guide.practice.map(p => p.title), relatedJobs: guide.related.jobs, relatedExperiences: guide.related.experiences } : undefined;
    return {...safe,data:{...rest,authorizationNote:undefined,tasks:c.data.tasks.map(({reference: _reference,...task}) => task),guideSummary:summary}};
  }
  list(kind?: string, admin = false) {
    return this.store.all<{id:string}>('SELECT id FROM content ORDER BY updated_at DESC,id').map(x => this.content(x.id)).filter(x => (!kind || x.kind === kind) && (admin || ['published','expired'].includes(x.status))).map(x => admin ? x : this.publicContent(x.id));
  }
  requireUser(ctx: Identity) { demand(ctx.userId,401,'LOGIN_REQUIRED','请登录后继续'); return ctx.userId; }
  requireAdmin(ctx: Identity) { this.requireUser(ctx); demand(ctx.role === 'admin',403,'FORBIDDEN','你没有管理权限'); }
  activeExperience(id: string) { const c = this.content(id); demand(c.kind==='experience' && c.status==='published',409,'UNAVAILABLE','体验已下线，不能继续保存或提交，原作答仍保留'); return c; }

  /* ---------- 体验版本 ---------- */
  versionRow(id: string, v: number) { return this.store.get('SELECT * FROM experience_versions WHERE experience_id=? AND version=?', id, v); }
  /* 学生可以使用的版本：当前发布版本；或自己草稿所在、已被新版本替代的旧版本（允许把旧版做完，不静默换题）。 */
  usableData(ctx: Identity, id: string, v: number): ContentData {
    const c = this.activeExperience(id);
    if (v === c.version) return c.data;
    const d = this.store.get('SELECT content_version FROM drafts WHERE owner=? AND content_id=?', ctx.owner, id);
    const row = this.versionRow(id, v);
    demand(d && d.content_version === v && row && row.state === 'superseded', 409, 'CONTENT_CHANGED', '体验内容已更新，请重新打开体验');
    return JSON.parse(row.data);
  }
  guide(ctx: Identity, id: string) {
    const c = this.content(id); demand(c.kind === 'experience', 404, 'NOT_FOUND', '体验不存在');
    if (c.status !== 'published') return { id, status: c.status, unavailable: true, title: c.data.title };
    const d = this.store.get('SELECT content_version FROM drafts WHERE owner=? AND content_id=?', ctx.owner, id);
    let v = c.version, data = c.data;
    if (d && d.content_version !== c.version) { const row = this.versionRow(id, d.content_version); if (row && row.state === 'superseded') { v = d.content_version; data = JSON.parse(row.data); } }
    const co = c.companyId ? this.content(c.companyId) : null;
    // 允许只看不做：简版练习也返回参考思路（页面上需要学生主动点开）；只看参考不会生成完成记录。
    const safe = data;
    return { id, status: c.status, demo: c.demo, version: v, latest: c.version, outdated: v !== c.version, company: co && co.status === 'published' ? { id: co.id, title: co.data.title } : null, data: { ...safe, authorizationNote: undefined } };
  }

  /* ---------- 草稿 ---------- */
  draft(ctx: Identity, id: string) {
    const row = this.store.get('SELECT * FROM drafts WHERE owner=? AND content_id=?',ctx.owner,id);
    if (!row) return null;
    const conflictWith = row.conflict ? (row.conflict_with && this.store.get('SELECT * FROM recoveries WHERE id=? AND owner=?', row.conflict_with, ctx.owner)) || this.store.get('SELECT * FROM recoveries WHERE owner=? AND content_id=? ORDER BY created_at DESC LIMIT 1', ctx.owner, id) : null;
    return {...row,answers:JSON.parse(row.answers),progress:JSON.parse(row.progress || '{}'),conflictWith:conflictWith?{...conflictWith,answers:JSON.parse(conflictWith.answers)}:null};
  }
  archive(owner: string, id: string, contentVersion: number, answers: string, reason: string) {
    const rid = randomUUID(); this.store.run('INSERT INTO recoveries VALUES (?,?,?,?,?,?,?)',rid,owner,id,contentVersion,answers,reason,now()); return rid;
  }
  mergeProgress(old: Partial<Progress> | undefined, next: unknown): Progress {
    const a = progressSchema.parse(old || {}), b = progressSchema.parse(next || {});
    return { step: b.step, visited: [...new Set([...a.visited, ...b.visited])].sort(), referenceViewed: a.referenceViewed || b.referenceViewed, hintsOpened: [...new Set([...a.hintsOpened, ...b.hintsOpened])].slice(0, 40) };
  }
  saveDraft(ctx: Identity, id: string, input: unknown) {
    const b = z.object({version:z.number().int().min(0),contentVersion:z.number().int().min(1),answers:answersSchema,progress:z.unknown().optional()}).parse(input);
    const failure = this.store.transaction(() => {
      this.usableData(ctx, id, b.contentVersion);
      const current = this.draft(ctx,id); const answers = JSON.stringify(b.answers);
      if (current?.conflict) { this.archive(ctx.owner,id,b.contentVersion,answers,'草稿冲突待处理时写的作答'); return 'DRAFT_CONFLICT'; }
      if (!current && b.version > 0) { this.archive(ctx.owner,id,b.contentVersion,answers,'草稿已提交或已处理后，另一个页面写的作答'); return 'DRAFT_GONE'; }
      if (current && current.version !== b.version && current.content_version === b.contentVersion) {
        const progress = JSON.stringify(this.mergeProgress(current.progress, b.progress ?? current.progress));
        // 另一个页面只是翻了步骤、作答相同：合并浏览进度即可，不算冲突，也不改变草稿版本号。
        if (sameAnswers(current.answers, b.answers)) { this.store.run('UPDATE drafts SET progress=? WHERE owner=? AND content_id=?', progress, ctx.owner, id); return null; }
        // 服务器上的草稿还没有任何作答（只有浏览进度）：接受这次作答，不会丢失内容。
        if (!hasContent(current.answers)) { this.store.run('UPDATE drafts SET answers=?,progress=?,version=version+1,saved_at=? WHERE owner=? AND content_id=?', JSON.stringify(b.answers), progress, now(), ctx.owner, id); return null; }
      }
      if (current && current.version !== b.version) {
        // 同一账号在两个页面同时修改：两份都保留，标记冲突，让用户选择。
        const rid = this.archive(ctx.owner,id,b.contentVersion,answers,'另一个页面同时修改时保留的作答');
        this.store.run('UPDATE drafts SET conflict=1,conflict_with=?,version=version+1 WHERE owner=? AND content_id=?',rid,ctx.owner,id);
        return 'DRAFT_CONFLICT';
      }
      const progress = JSON.stringify(this.mergeProgress(current?.progress, b.progress ?? current?.progress));
      this.store.run('INSERT INTO drafts(owner,content_id,version,content_version,answers,conflict,saved_at,progress) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner,content_id) DO UPDATE SET version=excluded.version,content_version=excluded.content_version,answers=excluded.answers,saved_at=excluded.saved_at,progress=excluded.progress',ctx.owner,id,b.version+1,b.contentVersion,answers,0,now(),progress);
      return null;
    });
    if(failure==='DRAFT_CONFLICT') throw new Problem(409,'DRAFT_CONFLICT','草稿发生冲突，两份内容都已保留，请选择要继续的版本');
    if(failure==='DRAFT_GONE') throw new Problem(409,'DRAFT_GONE','这份草稿已经提交或被处理。刚才的作答已放进「可恢复的作答」');
    return this.draft(ctx,id);
  }
  resolveDraft(ctx: Identity, id: string, input: unknown) {
    const b = z.object({version:z.number().int().min(1),recoveryId:z.string().max(100).nullable()}).parse(input);
    return this.store.transaction(() => {
      const current = this.draft(ctx,id); demand(current && current.version===b.version,409,'DRAFT_CONFLICT','草稿已变化，请刷新后重新选择');
      if (b.recoveryId) {
        const other = this.store.get('SELECT * FROM recoveries WHERE id=? AND owner=? AND content_id=?',b.recoveryId,ctx.owner,id);
        demand(other,404,'NOT_FOUND','恢复副本不存在');
        this.archive(ctx.owner,id,current.content_version,JSON.stringify(current.answers),'选择另一份作答前的草稿');
        this.store.run('UPDATE drafts SET answers=?,content_version=?,version=version+1,conflict=0,conflict_with=NULL,saved_at=? WHERE owner=? AND content_id=?',other.answers,other.content_version,now(),ctx.owner,id);
        this.store.run('DELETE FROM recoveries WHERE id=?', other.id);
      } else this.store.run('UPDATE drafts SET conflict=0,conflict_with=NULL,version=version+1 WHERE owner=? AND content_id=?',ctx.owner,id);
      this.store.audit(ctx.owner,'resolve_draft',id,b.recoveryId?'restore':'keep');
      return this.draft(ctx,id);
    });
  }
  /* 从「可恢复的作答」恢复：没有草稿时新建；有草稿时把当前草稿放回恢复区。 */
  restore(ctx: Identity, rid: string) {
    return this.store.transaction(() => {
      const r = this.store.get('SELECT * FROM recoveries WHERE id=? AND owner=?', rid, ctx.owner);
      demand(r, 404, 'NOT_FOUND', '恢复副本不存在');
      const c = this.activeExperience(r.content_id);
      demand(!this.store.get('SELECT 1 FROM submissions WHERE owner=? AND content_id=? AND content_version=?', ctx.owner, r.content_id, c.version), 409, 'ALREADY_DONE', '你已完成当前版本，这份作答只能查看');
      demand(r.content_version === c.version, 409, 'CONTENT_CHANGED', '这份作答对应的是旧版本内容，只能查看，不能直接恢复');
      const current = this.draft(ctx, r.content_id);
      demand(!current?.conflict, 409, 'DRAFT_CONFLICT', '请先处理这个体验的草稿冲突');
      if (current) {
        this.archive(ctx.owner, r.content_id, current.content_version, JSON.stringify(current.answers), '恢复其他作答前的草稿');
        this.store.run('UPDATE drafts SET answers=?,content_version=?,version=version+1,saved_at=? WHERE owner=? AND content_id=?', r.answers, r.content_version, now(), ctx.owner, r.content_id);
      } else this.store.run('INSERT INTO drafts(owner,content_id,version,content_version,answers,conflict,saved_at,progress) VALUES (?,?,?,?,?,?,?,?)', ctx.owner, r.content_id, 1, r.content_version, r.answers, 0, now(), '{}');
      this.store.run('DELETE FROM recoveries WHERE id=?', rid);
      return this.draft(ctx, r.content_id);
    });
  }
  removeRecovery(ctx: Identity, rid: string) {
    const r = this.store.run('DELETE FROM recoveries WHERE id=? AND owner=?', rid, ctx.owner);
    demand(r.changes, 404, 'NOT_FOUND', '恢复副本不存在'); return { ok: true };
  }

  /* ---------- 完成 ---------- */
  submit(ctx: Identity, id: string, input: unknown) {
    const owner = this.requireUser(ctx); const b = z.object({version:z.number().int().min(1),contentVersion:z.number().int().min(1),reflection:z.unknown().optional()}).parse(input);
    const reflection = reflectionSchema.parse(b.reflection || {});
    return this.store.transaction(() => {
      const c = this.activeExperience(id);
      const old = this.store.get('SELECT id FROM submissions WHERE owner=? AND content_id=? AND content_version=?',owner,id,b.contentVersion);
      if(old) return {id:old.id,duplicate:true};
      const data = this.usableData(ctx, id, b.contentVersion);
      const d = this.draft(ctx,id); demand(d && !d.conflict && d.version===b.version && d.content_version===b.contentVersion,409,'DRAFT_CONFLICT','请先保存并解决草稿冲突');
      const status = requiredStatus(data, d.answers);
      // 只浏览、没有完成作答，不生成完成记录。
      if (status.missing.length) throw new Problem(422,'INCOMPLETE','还有作答没有完成：' + status.missing.slice(0,3).join('、') + (status.missing.length > 3 ? ' 等' : ''), status.missing);
      const snapshot = { id: c.id, version: b.contentVersion, companyId: c.companyId, demo: c.demo, data };
      const rid = randomUUID();
      this.store.run('INSERT INTO submissions(id,owner,content_id,content_version,snapshot,answers,created_at,reflection) VALUES (?,?,?,?,?,?,?,?)',rid,owner,id,b.contentVersion,JSON.stringify(snapshot),JSON.stringify(d.answers),now(),JSON.stringify(reflection));
      this.store.run('DELETE FROM drafts WHERE owner=? AND content_id=?', owner, id);
      return {id:rid,duplicate:false};
    });
  }
  record(ctx: Identity, id: string) {
    this.requireUser(ctx); const row = this.store.get('SELECT * FROM submissions WHERE id=? AND owner=?',id,ctx.owner);
    demand(row,404,'NOT_FOUND','完成记录不存在');
    const c = this.content(row.content_id);
    return {...row,snapshot:JSON.parse(row.snapshot),answers:JSON.parse(row.answers),reflection:JSON.parse(row.reflection||'{}'),current:{status:c.status,version:c.version}};
  }
  mine(ctx: Identity) {
    const drafts = this.store.all('SELECT content_id FROM drafts WHERE owner=? ORDER BY saved_at DESC',ctx.owner).map(d => {
      const draft = this.draft(ctx,d.content_id)!; const c = this.content(d.content_id);
      let progressInfo = null as null | { done: number; total: number };
      const row = this.versionRow(d.content_id, draft.content_version);
      if (row) { const s = requiredStatus(JSON.parse(row.data), draft.answers); progressInfo = { done: s.done, total: s.total }; }
      return { contentId: d.content_id, version: draft.version, contentVersion: draft.content_version, savedAt: draft.saved_at, conflict: !!draft.conflict, progress: draft.progress, answered: progressInfo, outdated: draft.content_version !== c.version, content: this.publicContent(d.content_id) };
    });
    return {
      drafts,
      recoveries:this.store.all('SELECT * FROM recoveries WHERE owner=? ORDER BY created_at DESC',ctx.owner).map(r=>({...r,answers:JSON.parse(r.answers),title:this.content(r.content_id).data.title})),
      favorites:ctx.userId ? this.store.all('SELECT content_id FROM favorites WHERE owner=? ORDER BY created_at DESC',ctx.owner).map(f=>this.publicContent(f.content_id)) : [],
      records:ctx.userId ? this.store.all('SELECT id,content_id,content_version,created_at,snapshot FROM submissions WHERE owner=? ORDER BY created_at DESC',ctx.owner).map(r=>({id:r.id,contentId:r.content_id,contentVersion:r.content_version,createdAt:r.created_at,title:JSON.parse(r.snapshot).data.title,direction:JSON.parse(r.snapshot).data.direction})) : []
    };
  }

  /* ---------- 收藏、投递、反馈（沿用 Codex） ---------- */
  favorite(ctx: Identity,id:string,on:boolean) {
    this.requireUser(ctx); const c = this.content(id);
    if(on) { demand(['published','expired'].includes(c.status),409,'UNAVAILABLE','内容暂不可用'); this.store.run('INSERT OR IGNORE INTO favorites VALUES (?,?,?)',ctx.owner,id,now()); }
    else this.store.run('DELETE FROM favorites WHERE owner=? AND content_id=?',ctx.owner,id);
    return {saved:on};
  }
  apply(ctx: Identity,id:string) {
    return this.store.transaction(() => {
      const c = this.content(id); demand(['job','event'].includes(c.kind) && c.status==='published',409,'UNAVAILABLE','该机会已截止或下架，无法继续');
      if(c.demo) { this.store.run('INSERT INTO clicks(content_id,owner,action,created_at) VALUES (?,?,?,?)',id,ctx.owner,'demo_apply',now()); return {demo:true,message:'这是示例信息，仅演示投递流程：不会发送邮件，也不会跳转到真实招聘页面。上场不会把这次点击记为「已投递」。'}; }
      const domain = c.companyId ? this.content(c.companyId).data.officialDomain : undefined;
      const url = validateDestination(c.data.applyUrl,domain);
      this.store.run('INSERT INTO clicks(content_id,owner,action,created_at) VALUES (?,?,?,?)',id,ctx.owner,c.kind==='job'?'click_apply':'event_click',now());
      return {demo:false,url,message:'即将离开上场。投递由企业官网或招聘邮箱接收；上场仅记录点击，不代表已投递。'};
    });
  }
  report(ctx: Identity,id:string,input:unknown) {
    const b = z.object({reason:z.string().trim().min(3,'请至少写 3 个字').max(1000)}).parse(input); const c = this.content(id); demand(c.kind==='job',422,'KIND','请选择岗位');
    const rid=randomUUID(); this.store.run('INSERT INTO reports(id,content_id,owner,reason,created_at) VALUES (?,?,?,?,?)',rid,id,ctx.owner,b.reason,now()); return {id:rid};
  }

  /* ---------- 后台：招聘 / 赛事 / 企业（沿用 Codex 发布规则） ---------- */
  publicationRules(c:Content) {
    const d=c.data;
    if(c.kind==='company') demand(d.authorized && d.authorizationNote.trim(),422,'AUTHORIZATION','请登记企业展示授权与依据');
    if(c.companyId) demand(this.content(c.companyId).status==='published',422,'AUTHORIZATION','企业未授权展示或已下架');
    if(c.kind==='job') {
      demand(c.companyId && d.title && d.direction && d.city && d.salary && d.duties && d.requirements && d.source && d.applyUrl,422,'REQUIRED','请完整填写企业、方向、城市/远程、薪资、职责、要求、来源和投递方式');
      demand(c.confirmedVersion===c.version && c.confirmation.trim(),422,'UNCONFIRMED','当前版本尚未获得企业确认');
      const co=this.content(c.companyId);
      if(!c.demo) demand(!co.demo && co.data.officialDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(co.data.officialDomain),422,'DOMAIN','真实岗位须关联真实企业并核验官网域名');
      validateDestination(d.applyUrl,co.data.officialDomain || undefined);
    }
    if(['job','event'].includes(c.kind)) demand(Number.isFinite(Date.parse(d.deadline)) && Date.parse(d.deadline)>Date.now(),422,'DEADLINE','请填写尚未截止的有效日期');
    if(c.kind==='event') { demand(d.organizer && d.source && d.eligibility && d.city && d.applyUrl,422,'REQUIRED','请补全主办方、来源、地点、资格和报名地址'); validateDestination(d.applyUrl); }
    if(c.kind==='experience') {
      const row = this.versionRow(c.id, c.version);
      demand(row && row.state === 'published', 422, 'NO_VERSION', '请先在「体验内容」里审核并发布一个版本');
      if (c.data.sourceType === 'cocreate') demand(c.companyId && row.cocreate_confirmation.trim(), 422, 'COCREATE', '企业共创体验必须关联企业并记录企业确认');
    }
  }
  edit(ctx: Identity,input:unknown) {
    this.requireAdmin(ctx); const b=editSchema.parse(input);
    return this.store.transaction(() => {
      const id=b.id || randomUUID(); const old=b.id?this.content(id):null;
      demand(!(old && old.kind==='experience'),422,'USE_VERSIONS','岗位体验请在「体验内容」里新建版本修改，已发布版本不会被覆盖');
      demand(!old || old.version===b.version,409,'VERSION_CONFLICT','内容已被其他管理员修改，请重新载入');
      demand(!old || old.kind===b.kind,422,'KIND','不能修改内容类型');
      demand(b.kind!=='company' || !b.companyId,422,'COMPANY','企业不能关联其他企业');
      if(b.companyId) demand(this.content(b.companyId).kind==='company',422,'COMPANY','请选择有效企业');
      if(b.kind==='experience') checkGuide(b.data);
      const version=(old?.version||0)+1;
      // Conservative: every edit invalidates confirmation; unpublished versions never leak publicly.
      this.store.run('INSERT INTO content VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,state=excluded.state,version=excluded.version,confirmed_version=NULL,confirmation=\'\',demo=excluded.demo,data=excluded.data,updated_at=excluded.updated_at',id,b.kind,b.companyId,old?'pending':'draft',version,null,'',Number(b.demo),JSON.stringify(b.data),now());
      if(b.kind==='experience') this.store.run('INSERT INTO experience_versions(experience_id,version,state,data,created_by,created_at,company_id) VALUES (?,?,?,?,?,?,?)',id,version,'draft',JSON.stringify(b.data),ctx.owner,now(),b.companyId);
      this.store.audit(ctx.owner,'edit',id,JSON.stringify({version,before:old}));
      return this.content(id);
    });
  }
  transition(ctx:Identity,id:string,input:unknown) {
    this.requireAdmin(ctx); const b=z.object({action:z.enum(['confirm','publish','offline','verify','pending']),version:z.number().int(),note:z.string().trim().max(2000).default('')}).parse(input);
    return this.store.transaction(()=>{
      const c=this.content(id); demand(c.version===b.version,409,'VERSION_CONFLICT','内容已变化，请重新载入');
      if(b.action==='confirm') { demand(c.kind==='job' && b.note.length>=3,422,'CONFIRMATION','请填写企业确认依据'); this.store.run('UPDATE content SET confirmed_version=version,confirmation=? WHERE id=?',b.note,id); }
      if(b.action==='publish') { this.publicationRules(c); this.store.run("UPDATE content SET state='published' WHERE id=?",id); }
      if(b.action==='offline' || b.action==='pending') this.store.run('UPDATE content SET state=? WHERE id=?',b.action,id);
      if(b.action==='verify') demand(b.note.length>=3,422,'NOTE','请记录核验渠道和结论');
      this.store.audit(ctx.owner,b.action,id,b.note); return this.content(id);
    });
  }

  /* ---------- 后台：体验内容版本 ---------- */
  versions(ctx: Identity, id: string) {
    this.requireAdmin(ctx); const c = this.content(id); demand(c.kind === 'experience', 404, 'NOT_FOUND', '体验不存在');
    const stats = { drafts: this.store.get('SELECT count(*) n FROM drafts WHERE content_id=?', id).n, completions: this.store.get('SELECT count(*) n FROM submissions WHERE content_id=?', id).n };
    return { content: c, stats, versions: this.store.all('SELECT * FROM experience_versions WHERE experience_id=? ORDER BY version DESC', id).map(v => ({ ...v, data: JSON.parse(v.data), completions: this.store.get('SELECT count(*) n FROM submissions WHERE content_id=? AND content_version=?', id, v.version).n })) };
  }
  createVersion(ctx: Identity, id: string) {
    this.requireAdmin(ctx);
    return this.store.transaction(() => {
      const c = this.content(id); demand(c.kind === 'experience', 404, 'NOT_FOUND', '体验不存在');
      demand(!this.store.get("SELECT 1 FROM experience_versions WHERE experience_id=? AND state IN ('draft','in_review','returned','approved')", id), 409, 'OPEN_VERSION', '已经有一个未发布的版本，请先处理它');
      const base = this.store.get('SELECT * FROM experience_versions WHERE experience_id=? ORDER BY version DESC LIMIT 1', id);
      const v = (base?.version || 0) + 1;
      this.store.run('INSERT INTO experience_versions(experience_id,version,state,data,source_note,created_by,created_at,company_id) VALUES (?,?,?,?,?,?,?,?)', id, v, 'draft', base ? base.data : JSON.stringify(c.data), base?.source_note || '', ctx.owner, now(), base ? base.company_id : c.companyId);
      this.store.audit(ctx.owner, 'version_create', id, 'v' + v); return { version: v };
    });
  }
  updateVersion(ctx: Identity, id: string, v: number, input: unknown) {
    this.requireAdmin(ctx);
    const b = z.object({ data: contentSchema, sourceNote: z.string().trim().max(2000), changeNote: z.string().trim().max(2000), rev: z.number().int().min(0), companyId: z.string().max(100).nullable().default(null) }).parse(input);
    return this.store.transaction(() => {
      const row = this.versionRow(id, v); demand(row, 404, 'NOT_FOUND', '版本不存在');
      demand(['draft', 'returned'].includes(row.state), 409, 'LOCKED', '只有草稿或被退回的版本可以修改；已提交审核、已通过或已发布的版本不能直接改');
      // 两位管理员同时编辑：后保存的一方会收到冲突提示，不会静默覆盖。
      demand(row.rev === b.rev, 409, 'VERSION_CONFLICT', '这个版本已被其他管理员修改。请复制你的修改，重新载入后再合并');
      if (b.companyId) demand(this.content(b.companyId).kind === 'company', 422, 'COMPANY', '请选择有效企业');
      demand(this.content(id).data.format === b.data.format, 422, 'FORMAT', '不能在版本里切换「完整引导 / 简版练习」，请新建一个体验');
      checkGuide(b.data);
      // 内容改动会清空企业共创确认：企业确认的是具体版本内容，改过就要重新确认。
      this.store.run("UPDATE experience_versions SET data=?,source_note=?,change_note=?,state='draft',cocreate_confirmation='',company_id=?,rev=rev+1 WHERE experience_id=? AND version=?", JSON.stringify(b.data), b.sourceNote, b.changeNote, b.companyId, id, v);
      this.store.audit(ctx.owner, 'version_edit', id, 'v' + v); return { ok: true, rev: row.rev + 1 };
    });
  }
  reviewVersion(ctx: Identity, id: string, v: number, input: unknown) {
    this.requireAdmin(ctx);
    const b = z.object({ action: z.enum(['submit', 'approve', 'return', 'cocreate']), note: z.string().trim().max(2000).default('') }).parse(input);
    return this.store.transaction(() => {
      const row = this.versionRow(id, v); demand(row, 404, 'NOT_FOUND', '版本不存在'); const data: ContentData = JSON.parse(row.data);
      if (b.action === 'submit') { demand(row.state === 'draft', 409, 'STATE', '只有草稿可以提交审核'); demand(row.source_note.trim().length >= 4, 422, 'SOURCE', '请先写明内容来源（例如：平台根据公开资料整理，数据为虚构）'); checkGuide(data); this.store.run("UPDATE experience_versions SET state='in_review' WHERE experience_id=? AND version=?", id, v); }
      if (b.action === 'approve') { demand(row.state === 'in_review', 409, 'STATE', '只有审核中的版本可以通过'); this.store.run("UPDATE experience_versions SET state='approved',reviewed_by=?,reviewed_at=?,review_note=? WHERE experience_id=? AND version=?", ctx.owner, now(), b.note, id, v); }
      if (b.action === 'return') { demand(row.state === 'in_review', 409, 'STATE', '只有审核中的版本可以退回'); demand(b.note.length >= 3, 422, 'NOTE', '请写明退回原因'); this.store.run("UPDATE experience_versions SET state='returned',reviewed_by=?,reviewed_at=?,review_note=? WHERE experience_id=? AND version=?", ctx.owner, now(), b.note, id, v); }
      if (b.action === 'cocreate') {
        demand(data.sourceType === 'cocreate', 422, 'COCREATE', '只有标为「企业共创」的版本需要记录企业确认');
        demand(row.company_id, 422, 'COCREATE', '企业共创版本必须先关联企业');
        demand(['in_review', 'approved'].includes(row.state), 409, 'STATE', '请在审核中或审核通过后记录企业确认');
        demand(b.note.length >= 8, 422, 'NOTE', '请写明企业确认人（职务即可）、方式和日期');
        this.store.run('UPDATE experience_versions SET cocreate_confirmation=? WHERE experience_id=? AND version=?', b.note, id, v);
      }
      this.store.audit(ctx.owner, 'version_' + b.action, id, 'v' + v + (b.note ? '：' + b.note : '')); return { ok: true };
    });
  }
  publishVersion(ctx: Identity, id: string, v: number) {
    this.requireAdmin(ctx);
    return this.store.transaction(() => {
      const row = this.versionRow(id, v); demand(row, 404, 'NOT_FOUND', '版本不存在');
      demand(row.state === 'approved', 409, 'STATE', '版本需要审核通过后才能发布');
      const data = contentSchema.parse(JSON.parse(row.data)); checkGuide(data);
      const c = this.content(id);
      if (data.sourceType === 'cocreate') demand(row.company_id && row.cocreate_confirmation.trim(), 422, 'COCREATE', '企业共创体验必须关联企业，并记录企业的实际确认');
      if (row.company_id) demand(this.content(row.company_id).status === 'published', 422, 'AUTHORIZATION', '关联企业未授权展示或已下架');
      // 旧版本只改状态为「已替代」，内容不变；历史完成记录仍对应各自的版本快照。
      this.store.run("UPDATE experience_versions SET state='superseded' WHERE experience_id=? AND state='published'", id);
      this.store.run("UPDATE experience_versions SET state='published',published_at=? WHERE experience_id=? AND version=?", now(), id, v);
      this.store.run("UPDATE content SET data=?,version=?,company_id=?,state=CASE WHEN state IN ('draft','pending') THEN 'published' ELSE state END,updated_at=? WHERE id=?", JSON.stringify(data), v, row.company_id, now(), id);
      this.store.audit(ctx.owner, 'version_publish', id, 'v' + v); return this.content(id);
    });
  }

  /* ---------- 企业合作意向 ---------- */
  cooperation(ctx: Identity, input: unknown) {
    const b = z.object({
      company: z.string().trim().min(2, '请填写企业名称').max(100), contactName: z.string().trim().min(1, '请填写联系人').max(50),
      contact: z.string().trim().min(5, '请填写手机号或工作邮箱').max(100), roles: z.string().trim().min(4, '请简单描述想介绍的岗位或场景').max(1000),
      note: z.string().trim().max(2000).default(''), consent: z.literal(true, { message: '请确认同意我们为合作沟通使用这些联系方式' })
    }).parse(input);
    const id = randomUUID();
    this.store.run('INSERT INTO coop_intents(id,company,contact_name,contact,roles,note,owner,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, b.company, b.contactName, b.contact, b.roles, b.note, ctx.owner, now(), now());
    return { id, state: 'new' };
  }
  updateIntent(ctx: Identity, id: string, input: unknown) {
    this.requireAdmin(ctx); const b = z.object({ state: z.enum(['new','contacted','declined','partnered']), adminNote: z.string().trim().max(2000).default('') }).parse(input);
    const r = this.store.run('UPDATE coop_intents SET state=?,admin_note=?,updated_at=? WHERE id=?', b.state, b.adminNote, now(), id);
    demand(r.changes, 404, 'NOT_FOUND', '合作意向不存在'); this.store.audit(ctx.owner, 'intent_' + b.state, id, b.adminNote); return { ok: true };
  }

  adminData(ctx:Identity) {
    this.requireAdmin(ctx);
    // 后台只有内容管理和匿名汇总；不返回任何学生的草稿或作答。
    return {content:this.list(undefined,true),reports:this.store.all('SELECT * FROM reports ORDER BY created_at DESC'),audit:this.store.all('SELECT * FROM audit ORDER BY id DESC LIMIT 200'),intents:this.store.all('SELECT * FROM coop_intents ORDER BY created_at DESC'),
      versions:this.store.all("SELECT experience_id,version,state,change_note,source_note,cocreate_confirmation,review_note,reviewed_at,published_at,created_at FROM experience_versions ORDER BY experience_id,version DESC")};
  }
  resolveReport(ctx:Identity,id:string,input:unknown) {
    this.requireAdmin(ctx); const b=z.object({resolution:z.string().trim().min(3,'请至少写 3 个字').max(2000)}).parse(input);
    return this.store.transaction(()=>{
      const r=this.store.get('SELECT * FROM reports WHERE id=?',id); demand(r,404,'NOT_FOUND','反馈不存在'); demand(r.state==='open',409,'REPORT_RESOLVED','该反馈已处理');
      this.store.run("UPDATE reports SET state='resolved',resolution=?,resolved_by=?,resolved_at=? WHERE id=?",b.resolution,ctx.owner,now(),id);
      this.store.audit(ctx.owner,'resolve_report',r.content_id,b.resolution); return {ok:true};
    });
  }
}
