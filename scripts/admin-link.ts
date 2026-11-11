import { Store } from '../src/server/db';
import { Auth } from '../src/server/auth';
import { primaryOrigin } from '../src/server/config';
/* 生成管理员一次性登录链接（必须在服务器命令行运行，例如 Render 的 Shell 页面）：
   npm run admin:link -- 13800000000
   - 手机号只用作管理员账号的标识，不会发短信；账号不存在时自动创建为管理员。
   - 链接 15 分钟内有效，只能使用一次；登录后的管理员会话 12 小时后失效，需要时重新生成。
   - 链接相当于临时密码：不要发到群里，不要截图分享。 */
const phone = process.argv[2];
if (!/^1[3-9]\d{9}$/.test(phone || '')) { console.error('用法：npm run admin:link -- 手机号'); process.exit(2); }
const store = new Store(); store.migrate();
const token = new Auth(store).createAdminLink(phone);
store.db.close();
console.log('\n管理员一次性登录链接（15 分钟内有效，只能用一次，不要分享）：\n');
console.log(`${primaryOrigin()}/login/link#${token}\n`);
