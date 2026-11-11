import { Store } from '../src/server/db';
/* 用法（在服务器命令行运行）：
   npm run admin -- 13800000000            授予已有账号管理员角色
   npm run admin -- 13800000000 --revoke   取消管理员角色，并让该账号所有已登录的会话立即失效 */
const phone = process.argv[2], revoke = process.argv.includes('--revoke');
if (!/^1[3-9]\d{9}$/.test(phone || '')) { console.error('用法：npm run admin -- 手机号 [--revoke]'); process.exit(2); }
const store = new Store(); store.migrate();
if (revoke) {
  const u = store.get<{ id: string }>('SELECT id FROM users WHERE phone=?', phone);
  if (!u) { console.error('没有这个账号'); process.exit(1); }
  store.run("UPDATE users SET role='student' WHERE id=?", u.id); store.run('DELETE FROM sessions WHERE user_id=?', u.id); store.run('UPDATE login_links SET used_at=? WHERE user_id=? AND used_at IS NULL', Date.now(), u.id);
  store.audit('operator-cli', 'revoke_admin', u.id); console.log('已取消管理员角色，并退出该账号的所有会话');
} else {
  const result = store.run("UPDATE users SET role='admin' WHERE phone=?", phone);
  if (!result.changes) { console.error('这个手机号还没有账号。试用版没有开放登录时，请用 npm run admin:link -- 手机号 生成管理员一次性登录链接'); process.exit(1); }
  store.audit('operator-cli', 'grant_admin', phone); console.log('已由本机运维命令授予管理员角色');
}
store.db.close();
