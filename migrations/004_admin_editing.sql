-- V1.4.1：后台内容维护
-- 1. 体验版本记录自己关联的企业（企业共创需要），发布时才写入线上内容；未发布的修改不影响线上。
-- 2. rev：版本草稿的修改计数，用于防止两位管理员同时编辑时静默覆盖。
ALTER TABLE experience_versions ADD COLUMN company_id TEXT REFERENCES content(id);
ALTER TABLE experience_versions ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
UPDATE experience_versions SET company_id = (SELECT company_id FROM content WHERE content.id = experience_versions.experience_id);
