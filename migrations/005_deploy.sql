-- 部署准备版：
-- 1. renewable：普通会话每次访问自动续期；一次性链接登录的管理员会话不续期（12 小时后失效）。
-- 2. login_links：管理员一次性登录链接（只能在服务器命令行生成，15 分钟内有效，只能用一次；只保存哈希）。
ALTER TABLE sessions ADD COLUMN renewable INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner);
CREATE TABLE login_links (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, used_at INTEGER, created_at TEXT NOT NULL);
