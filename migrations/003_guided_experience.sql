-- V1.4：引导式岗位体验、体验内容版本、浏览进度、完成时的反思、企业合作意向。
-- 002 中的作品库 / 企业查看投递等表保留但不开放任何入口（本轮暂停）。
ALTER TABLE drafts ADD COLUMN progress TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(progress));
-- 草稿冲突时，明确指向「另一份」作答所在的恢复副本。
ALTER TABLE drafts ADD COLUMN conflict_with TEXT;
ALTER TABLE submissions ADD COLUMN reflection TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(reflection));
CREATE TABLE experience_versions (
  experience_id TEXT NOT NULL REFERENCES content(id),
  version INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','in_review','returned','approved','published','superseded')),
  data TEXT NOT NULL CHECK(json_valid(data)),
  source_note TEXT NOT NULL DEFAULT '',
  change_note TEXT NOT NULL DEFAULT '',
  cocreate_confirmation TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  published_at TEXT,
  PRIMARY KEY (experience_id, version)
);
-- 既有体验迁移为第 1 个版本，保证历史草稿和完成记录能找到对应版本。
INSERT INTO experience_versions (experience_id, version, state, data, source_note, change_note, created_by, created_at, published_at)
  SELECT id, version, CASE WHEN state = 'published' THEN 'published' ELSE 'draft' END, data, '迁移自 V1.3 既有内容', '初始版本', 'migration-003', updated_at,
         CASE WHEN state = 'published' THEN updated_at END
  FROM content WHERE kind = 'experience';
CREATE TRIGGER immutable_released_version BEFORE UPDATE OF data, version, experience_id ON experience_versions
  WHEN OLD.state IN ('published', 'superseded')
  BEGIN SELECT RAISE(ABORT, 'released experience versions are immutable'); END;
CREATE TABLE coop_intents (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  roles TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'new' CHECK(state IN ('new','contacted','declined','partnered')),
  admin_note TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX coop_state ON coop_intents(state, created_at);
