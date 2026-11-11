import { z } from 'zod';
// 校验错误提示用中文。
z.config(z.locales.zhCN());
export class Problem extends Error { constructor(public status: number, public code: string, message: string, public detail?: unknown) { super(message); } }
export function demand(condition: unknown, status: number, code: string, message: string): asserts condition { if (!condition) throw new Problem(status, code, message); }
const text = z.string().trim().max(12000);
const short = z.string().trim().max(300);
const fieldId = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,39}$/i, '字段编号只能用字母、数字、点、下划线和短横线');

/* ---------- 简版任务（V1.3 留下的 4 个入门任务） ---------- */
export const taskSchema = z.object({ title: short.min(1), prompt: text, options: z.array(short.min(1)).max(10).optional(), reference: text.min(1) });

/* ---------- 引导式岗位体验（V1.4） ---------- */
export const materialSchema = z.object({
  id: short.min(1), title: short.min(1), kind: z.enum(['table', 'text', 'quotes', 'list']),
  note: text.default(''), columns: z.array(short).max(12).default([]), rows: z.array(z.array(short).max(12)).max(40).default([]),
  text: text.default(''), items: z.array(text).max(30).default([])
});
export const termSchema = z.object({ term: short.min(1), def: text.min(1) });
export const practiceFieldSchema = z.object({
  id: fieldId, label: short.min(1), kind: z.enum(['text', 'textarea', 'choices']),
  options: z.array(short.min(1)).max(10).default([]), placeholder: short.default(''), required: z.boolean().default(true)
});
export const guideSchema = z.object({
  notInternship: text.min(1),
  role: z.object({
    problem: text.min(1), week: z.array(z.object({ when: short.min(1), what: text.min(1) })).min(1).max(10),
    tools: z.array(short).max(20), deliverables: z.array(short).max(20), hard: z.array(text).max(10), interests: z.array(short).max(10), caveat: text.min(1)
  }),
  demo: z.object({
    title: short.min(1), background: text.min(1), materials: z.array(materialSchema).max(10),
    thinking: z.array(z.object({ step: short.min(1), text: text.min(1) })).min(1).max(10), output: text.min(1), glossary: z.array(termSchema).max(20).default([])
  }),
  brief: z.object({
    role: text.min(1), situation: text.min(1), materials: z.array(materialSchema).min(1).max(10),
    deliverable: z.array(text).min(1).max(10), constraints: z.array(text).max(10), help: z.array(text).max(10)
  }),
  practice: z.array(z.object({
    id: short.min(1), title: short.min(1), prompt: text.min(1), hints: z.array(text).max(10), framework: text.default(''),
    terms: z.array(short).max(10).default([]), fields: z.array(practiceFieldSchema).min(1).max(6)
  })).min(1).max(10),
  reference: z.object({
    output: z.array(z.object({ heading: short.min(1), text: text.min(1) })).min(1).max(10),
    why: z.array(text).max(10), alternatives: z.array(text).max(10), pitfalls: z.array(text).max(10), missing: z.array(text).max(10), checklist: z.array(text).min(1).max(15)
  }),
  glossary: z.array(termSchema).max(30).default([]),
  related: z.object({ jobs: z.array(short).max(10).default([]), experiences: z.array(short).max(10).default([]) }).default({ jobs: [], experiences: [] })
});
export type Guide = z.infer<typeof guideSchema>;

export const contentSchema = z.object({
  title: short.min(1), about: text.default(''), direction: short.default(''), city: short.default(''),
  industry: short.default(''), size: short.default(''), directions: z.array(short).max(20).default([]),
  authorized: z.boolean().default(false), authorizationNote: text.default(''), officialDomain: short.default(''), cooperation: text.default(''),
  jobType: z.enum(['intern','campus']).default('intern'), salary: short.default(''), duties: text.default(''), requirements: text.default(''),
  deadline: z.string().max(40).default(''), source: short.default(''), applyUrl: z.string().max(2000).default(''), days: short.default(''), duration: short.default(''), graduation: short.default(''),
  eventType: z.enum(['hack','competition']).default('hack'), organizer: short.default(''), eligibility: text.default(''), prize: short.default(''),
  minutes: z.number().int().min(1).max(240).default(10), scene: text.default(''), tasks: z.array(taskSchema).max(20).default([]),
  related: z.array(z.string().max(100)).max(30).default([]),
  experienceType: z.enum(['intro','challenge']).default('intro'),
  workflow: text.default(''), material: text.default(''), materialVersion: short.default('1'), demonstration: text.default(''), hints: text.default(''), tradeoffs: text.default(''), nextSteps: text.default(''), reviewer: short.default(''),
  prerequisites: text.default(''), introIds: z.array(z.string().max(100)).max(20).default([]), deliverable: text.default(''), aiPolicy: text.default(''), reviewCriteria: text.default(''), feedbackPromise: text.default(''),
  companyParticipation: z.boolean().default(false), allowCrossCompany: z.boolean().default(false), materialSafety: text.default(''),
  // V1.4 岗位体验
  format: z.enum(['simple','guided']).default('simple'),
  level: short.default('入门 · 零基础可做'),
  willDo: z.array(short).max(10).default([]),
  learn: z.array(short).max(10).default([]),
  sourceType: z.enum(['platform','cocreate']).default('platform'),
  guide: guideSchema.optional()
}).strict();
export const editSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/).optional(), kind: z.enum(['company','event','job','experience']), companyId: z.string().max(100).nullable().default(null), version: z.number().int().min(0), demo: z.boolean(), data: contentSchema });
export type ContentData = z.infer<typeof contentSchema>;
export type Kind = z.infer<typeof editSchema>['kind'];

/* 作答：简版任务用 "0"、"1"… 作为键；引导式体验用字段编号。值为文字或多选数组。 */
export const answersSchema = z.record(fieldId, z.union([z.string().max(20000), z.array(short).max(10)])).refine(x => Object.keys(x).length <= 40, '作答字段过多');
export type Answers = z.infer<typeof answersSchema>;
export const progressSchema = z.object({
  step: z.number().int().min(0).max(5).default(0),
  visited: z.array(z.number().int().min(0).max(5)).max(6).default([]),
  referenceViewed: z.boolean().default(false),
  hintsOpened: z.array(short).max(40).default([])
}).strip();
export type Progress = z.infer<typeof progressSchema>;
export const reflectionSchema = z.object({
  understand: z.enum(['yes','some','no','']).default(''),
  likes: z.array(short).max(10).default([]),
  dislikes: text.max(2000).default(''),
  next: z.array(z.enum(['company','jobs','experiences','none'])).max(4).default([])
}).strip();

export const filled = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
export const hasContent = (answers: Answers | null | undefined) => !!answers && Object.values(answers).some(filled);
export const sameAnswers = (a: Answers, b: Answers) => {
  const norm = (x: Answers) => JSON.stringify(Object.keys(x).sort().filter(k => filled(x[k])).map(k => [k, Array.isArray(x[k]) ? [...(x[k] as string[])].sort() : String(x[k]).trim()]));
  return norm(a) === norm(b);
};

/* 引导式体验发布前检查：字段编号唯一、关联内容格式正确。 */
export function checkGuide(data: ContentData) {
  if (data.format !== 'guided') return;
  demand(data.guide, 422, 'GUIDE', '引导式体验必须包含 6 个步骤的内容');
  const ids = data.guide.practice.flatMap(p => p.fields.map(f => f.id));
  demand(new Set(ids).size === ids.length, 422, 'GUIDE', '作答字段编号不能重复');
  for (const p of data.guide.practice) for (const f of p.fields) demand(f.kind !== 'choices' || f.options.length >= 2, 422, 'GUIDE', `「${f.label}」至少需要两个选项`);
  demand(data.willDo.length > 0 && data.learn.length > 0, 422, 'GUIDE', '请填写「将体验的工作」和「能学到什么」');
}

/* 某一版本体验的作答是否完整（用于提交与状态显示）。 */
export function requiredStatus(data: ContentData, answers: Answers) {
  if (data.format === 'guided' && data.guide) {
    const fields = data.guide.practice.flatMap(p => p.fields).filter(f => f.required);
    const ok = (f: { id: string; kind: string; options: string[] }) => {
      const v = answers[f.id];
      if (f.kind === 'choices') return Array.isArray(v) && v.length > 0 && v.every(x => f.options.includes(x));
      return typeof v === 'string' && v.trim().length >= 2;
    };
    const missing = fields.filter(f => !ok(f)).map(f => f.label);
    return { total: fields.length, done: fields.length - missing.length, missing };
  }
  const missing = data.tasks.map((t, i) => {
    const v = answers[String(i)];
    const s = typeof v === 'string' ? v : '';
    const good = !t.options ? s.trim().length >= 2 : t.options.some(o => s.startsWith(o + '：') && s.slice(o.length + 1).trim().length >= 2);
    return good ? null : t.title;
  }).filter(Boolean) as string[];
  return { total: data.tasks.length, done: data.tasks.length - missing.length, missing };
}

export function validateDestination(url: string, domain?: string) {
  try {
    const u = new URL(url);
    if (u.protocol === 'mailto:') {
      demand(!u.search && !u.hash && /^[a-zA-Z0-9.!#$%&'*+\/=^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(u.pathname), 422, 'DESTINATION', '请填写单一企业招聘邮箱，不附带邮件内容');
      demand(!domain || u.pathname.split('@')[1].toLowerCase() === domain.toLowerCase(), 422, 'DESTINATION', '招聘邮箱必须属于已核验的企业域名');
    } else {
      demand(u.protocol === 'https:' && !u.username && !u.password && !u.port, 422, 'DESTINATION', '投递链接必须是 HTTPS 官方地址');
      demand(!domain || u.hostname === domain || u.hostname.endsWith('.' + domain), 422, 'DESTINATION', '投递链接必须属于已核验的企业域名');
    }
    demand(!/^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname), 422, 'DESTINATION', '请填写公开官网地址');
    return url;
  } catch (e) { if (e instanceof Problem) throw e; throw new Problem(422,'DESTINATION','投递地址格式不正确'); }
}
