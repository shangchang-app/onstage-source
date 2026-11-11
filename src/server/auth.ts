import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store, now } from './db';
import { ADMIN_LINK_SESSION_MS, sessionDays } from './config';
import { demand, hasContent, Problem, sameAnswers } from './validation';
export type Identity = { owner: string; userId: string | null; stamp: string; role: 'student' | 'admin'; phone?: string; enterprise?: boolean };
const sha = (x: string) => createHash('sha256').update(x).digest('hex');
export function authConfig(env = process.env) {
  const provider = env.SMS_PROVIDER || 'mock';
  if (env.NODE_ENV === 'production') {
    // 生产环境禁止模拟验证码；缺少短信网关或密钥时登录直接不可用，不会回退到模拟登录。
    demand(provider === 'http' && env.SMS_GATEWAY_URL?.startsWith('https://') && env.SMS_GATEWAY_TOKEN && (env.AUTH_SECRET?.length || 0) >= 32, 503, 'AUTH_CONFIG', '登录服务暂不可用，请稍后再试');
  }
  demand(['mock','http'].includes(provider),503,'AUTH_CONFIG','登录服务暂不可用');
  return provider;
}
export interface SmsProvider { send(phone: string, code: string): Promise<void> }
export class HttpSmsProvider implements SmsProvider {
  async send(phone: string, code: string) {
    const url = process.env.SMS_GATEWAY_URL;
    if (!url || !url.startsWith('https://') || !process.env.SMS_GATEWAY_TOKEN) throw new Problem(503,'AUTH_CONFIG','登录服务暂不可用');
    const result = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.SMS_GATEWAY_TOKEN}`},body:JSON.stringify({phone,code,expiresInSeconds:300}),signal:AbortSignal.timeout(10000)});
    demand(result.ok,503,'SMS_FAILED','验证码发送失败，请稍后重试');
  }
}
export type MergeResult = { moved: number; conflicts: string[]; archived: number };
export class Auth {
  constructor(public store: Store, private sms: SmsProvider = new HttpSmsProvider()) {}
  issue(userId: string | null = null, ttlMs = sessionDays() * 86400000, renewable = true) {
    const token = randomBytes(32).toString('hex'); const stamp = randomUUID();
    const owner = userId || `guest:${randomUUID()}`;
    this.store.run('INSERT INTO sessions(token_hash,stamp,owner,user_id,expires_at,renewable) VALUES (?,?,?,?,?,?)',sha(token),stamp,owner,userId,Date.now()+ttlMs,renewable?1:0);
    return { token, identity: this.read(token)! };
  }
  /* 自动续期：会话剩余时间不足（有效期 - 1 天）时延长到完整有效期。返回 true 表示需要重新下发 cookie。
     所以「连续超过有效期天数没有打开网站」才会过期；一次性链接登录的管理员会话不续期。 */
  renew(token?: string): boolean {
    if (!token) return false;
    const days = sessionDays(), full = days * 86400000;
    const r = this.store.run('UPDATE sessions SET expires_at=? WHERE token_hash=? AND renewable=1 AND expires_at>? AND expires_at<?', Date.now() + full, sha(token), Date.now(), Date.now() + full - 86400000);
    return Number(r.changes) > 0;
  }
  /* 管理员一次性登录链接：只能在服务器命令行生成（npm run admin:link），网站上没有入口。 */
  createAdminLink(phone: string) {
    const p = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效手机号（用作管理员账号标识）').parse(phone);
    return this.store.transaction(() => {
      let user = this.store.get('SELECT * FROM users WHERE phone=?', p);
      if (!user) { user = { id: randomUUID() }; this.store.run('INSERT INTO users(id,phone,role,created_at) VALUES (?,?,?,?)', user.id, p, 'admin', now()); }
      else this.store.run("UPDATE users SET role='admin' WHERE id=?", user.id);
      const token = randomBytes(32).toString('base64url');
      this.store.run('INSERT INTO login_links(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)', sha(token), user.id, Date.now() + 15 * 60000, now());
      this.store.audit('cli', 'admin_link', user.id, '生成一次性登录链接');
      return token;
    });
  }
  useAdminLink(tokenValue: unknown, previous: Identity, currentToken: string) {
    const t = z.string().min(20).max(200).parse(tokenValue);
    return this.store.transaction(() => {
      const link = this.store.get('SELECT l.*, u.role, u.disabled FROM login_links l JOIN users u ON u.id=l.user_id WHERE l.token_hash=?', sha(t));
      demand(link && !link.used_at && link.expires_at > Date.now(), 400, 'LINK_INVALID', '登录链接无效、已过期或已经用过。请在服务器上重新生成');
      demand(link.role === 'admin' && !link.disabled, 403, 'FORBIDDEN', '这个账号没有管理权限');
      this.store.run('UPDATE login_links SET used_at=? WHERE token_hash=?', Date.now(), sha(t));
      // 管理员会话不合并游客草稿，避免把浏览器里别人的作答带进管理员账号。
      this.store.run('DELETE FROM sessions WHERE token_hash=?', sha(currentToken));
      this.store.audit(link.user_id, 'admin_login', link.user_id, '一次性链接登录');
      void previous;
      return this.issue(link.user_id, ADMIN_LINK_SESSION_MS, false);
    });
  }
  /* 例行清理（最多每小时一次）：过期会话、验证码、限流记录、登录链接；
     以及「游客会话已过期、且超过有效期没有更新」的游客草稿 —— 这些草稿已经没有人能打开，保留只会占用空间。
     已登录账号的数据不会被清理。 */
  maintenance(force = false) {
    const g = globalThis as unknown as { onstageMaintenance?: number };
    if (!force && g.onstageMaintenance && Date.now() - g.onstageMaintenance < 3600000) return;
    g.onstageMaintenance = Date.now();
    const cutoff = new Date(Date.now() - sessionDays() * 86400000).toISOString();
    this.store.transaction(() => {
      this.store.run('DELETE FROM sessions WHERE expires_at<?', Date.now());
      this.store.run('DELETE FROM otp WHERE expires_at<?', Date.now());
      this.store.run('DELETE FROM rate_limits WHERE reset_at<?', Date.now());
      this.store.run('DELETE FROM login_links WHERE expires_at<? OR used_at IS NOT NULL', Date.now() - 86400000);
      this.store.run("DELETE FROM drafts WHERE owner LIKE 'guest:%' AND saved_at<? AND owner NOT IN (SELECT owner FROM sessions)", cutoff);
      this.store.run("DELETE FROM recoveries WHERE owner LIKE 'guest:%' AND created_at<? AND owner NOT IN (SELECT owner FROM sessions)", cutoff);
    });
  }
  read(token?: string): Identity | null {
    if (!token) return null;
    const s = this.store.get('SELECT s.*,u.role,u.phone,u.disabled FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?',sha(token),Date.now());
    return s && !s.disabled ? { owner:s.owner, userId:s.user_id, stamp:s.stamp, role:s.role || 'student', phone:s.phone ? s.phone.slice(0,3)+'****'+s.phone.slice(-4) : undefined, enterprise:!!this.store.get('SELECT 1 FROM enterprise_members WHERE user_id=? AND active=1',s.user_id || '') } : null;
  }
  guard(token: string | undefined, expected: string | null, login = false, admin = false) {
    const identity = this.read(token);
    demand(identity,401,'SESSION_EXPIRED','会话已过期，请重新确认身份');
    // 每个页面带着自己载入时的会话戳。其他标签页切换账号后，这里不一致，写入一律暂停。
    demand(expected === identity.stamp,409,'IDENTITY_CHANGED','登录身份已变化，当前操作已暂停。请重新确认身份后继续');
    demand(!login || identity.userId,401,'LOGIN_REQUIRED','请登录后继续，当前作答会保留');
    demand(!admin || identity.role === 'admin',403,'FORBIDDEN','你没有管理权限');
    return identity;
  }
  throttle(key: string, max: number, windowMs: number) {
    this.store.transaction(() => {
      const row = this.store.get('SELECT * FROM rate_limits WHERE key=?',key);
      if (!row || row.reset_at < Date.now()) this.store.run('INSERT OR REPLACE INTO rate_limits VALUES (?,?,?)',key,1,Date.now()+windowMs);
      else { demand(row.count < max,429,'RATE_LIMIT','操作过于频繁，请稍后再试'); this.store.run('UPDATE rate_limits SET count=count+1 WHERE key=?',key); }
    });
  }
  async send(phoneValue: unknown, owner: string) {
    const provider = authConfig(); const phone = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效手机号').parse(phoneValue);
    this.throttle('sms:'+owner,10,3600000); this.throttle('sms:global',100,3600000);
    const existing = this.store.get('SELECT * FROM otp WHERE phone=?',phone);
    demand(!existing || Date.now()-existing.sent_at >= 60000,429,'RATE_LIMIT','请在一分钟后重新获取验证码');
    const code = String(randomInt(100000,1000000));
    // Reserve the send window before awaiting external I/O to avoid concurrent SMS floods.
    this.store.run('INSERT OR REPLACE INTO otp VALUES (?,?,?,?,?)',phone,this.digest(phone,code),Date.now()+300000,0,Date.now());
    try { if (provider === 'http') await this.sms.send(phone,code); }
    catch { this.store.run('DELETE FROM otp WHERE phone=?',phone); throw new Problem(503,'SMS_FAILED','验证码发送失败，请稍后重试'); }
    // 只有开发 / 测试环境的模拟服务会把验证码返回给页面。
    return { mock: provider === 'mock', ...(provider === 'mock' ? { code } : {}) };
  }
  private digest(phone: string, code: string) { return createHmac('sha256',process.env.AUTH_SECRET || 'development-only').update(phone+':'+code).digest('hex'); }
  verify(phoneValue: unknown, codeValue: unknown, previous: Identity, token: string) {
    authConfig();
    const phone = z.string().regex(/^1[3-9]\d{9}$/,'请输入有效手机号').parse(phoneValue); const code = z.string().regex(/^\d{6}$/,'请输入 6 位验证码').parse(codeValue);
    const otp = this.store.get('SELECT * FROM otp WHERE phone=?',phone);
    demand(otp && otp.expires_at > Date.now() && otp.attempts < 5,400,'OTP','验证码已失效，请重新获取');
    this.store.run('UPDATE otp SET attempts=attempts+1 WHERE phone=?',phone);
    demand(timingSafeEqual(Buffer.from(otp.digest),Buffer.from(this.digest(phone,code))),400,'OTP','验证码不正确');
    return this.store.transaction(() => {
      this.store.run('DELETE FROM otp WHERE phone=?',phone);
      let user = this.store.get('SELECT * FROM users WHERE phone=?',phone);
      if (!user) { user = {id:randomUUID()}; this.store.run('INSERT INTO users(id,phone,role,created_at) VALUES (?,?,?,?)',user.id,phone,'student',now()); }
      // 只合并游客数据。已登录账号的数据永远不会迁到另一个账号。
      const merge: MergeResult = { moved: 0, conflicts: [], archived: 0 };
      if (!previous.userId) Object.assign(merge, this.mergeGuest(previous.owner, user.id));
      this.store.run('DELETE FROM sessions WHERE token_hash=?',sha(token));
      return { ...this.issue(user.id), merge };
    });
  }
  /* 游客草稿合并规则（V1.4，沿用 V1.3.1 已验收的规则）：
     1. 游客草稿没有作答内容：账号没有该体验草稿时只带走浏览进度，否则忽略。
     2. 账号已完成同一版本：游客作答不提交，放进「可恢复的作答」。
     3. 账号没有草稿、账号草稿为空、或两份作答相同：直接并入账号。
     4. 两份都有内容且不同：不覆盖、不丢弃。账号草稿标记冲突，游客作答进入「可恢复的作答」，由用户选择保留哪份。 */
  mergeGuest(guestOwner: string, userId: string): MergeResult {
    const r: MergeResult = { moved: 0, conflicts: [], archived: 0 };
    for (const g of this.store.all('SELECT * FROM drafts WHERE owner=?', guestOwner)) {
      const ga = JSON.parse(g.answers); const acc = this.store.get('SELECT * FROM drafts WHERE owner=? AND content_id=?', userId, g.content_id);
      const done = this.store.get('SELECT 1 FROM submissions WHERE owner=? AND content_id=? AND content_version=?', userId, g.content_id, g.content_version);
      const archive = (reason: string) => { const rid = randomUUID(); this.store.run('INSERT INTO recoveries VALUES (?,?,?,?,?,?,?)', rid, userId, g.content_id, g.content_version, g.answers, reason, now()); return rid; };
      if (done) { if (hasContent(ga)) { archive('账号已完成这个版本，登录前在本机写的作答'); r.archived++; } continue; }
      if (!acc) { this.store.run('INSERT INTO drafts(owner,content_id,version,content_version,answers,conflict,saved_at,progress) VALUES (?,?,?,?,?,?,?,?)', userId, g.content_id, 1, g.content_version, g.answers, 0, g.saved_at, g.progress || '{}'); r.moved++; continue; }
      if (!hasContent(ga)) continue;
      const aa = JSON.parse(acc.answers);
      if (!acc.conflict && !hasContent(aa)) {
        this.store.run('UPDATE drafts SET answers=?,content_version=?,version=version+1,saved_at=?,progress=? WHERE owner=? AND content_id=?', g.answers, g.content_version, g.saved_at, g.progress || acc.progress, userId, g.content_id);
        r.moved++; continue;
      }
      if (!acc.conflict && acc.content_version === g.content_version && sameAnswers(aa, ga)) { r.moved++; continue; } // 内容相同：保留账号原样
      const rid = archive('登录前在本机写的作答');
      this.store.run('UPDATE drafts SET conflict=1,conflict_with=?,version=version+1 WHERE owner=? AND content_id=?', rid, userId, g.content_id);
      r.conflicts.push(g.content_id);
    }
    this.store.run('UPDATE recoveries SET owner=? WHERE owner=?', userId, guestOwner);
    this.store.run('DELETE FROM drafts WHERE owner=?', guestOwner);
    return r;
  }
  logout(token: string) { this.store.run('DELETE FROM sessions WHERE token_hash=?',sha(token)); return this.issue(); }
}
