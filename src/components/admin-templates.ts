/* 新建岗位体验时的内容模板。模板本身能通过服务端校验，占位文字都以「（请填写）」开头，提醒替换。 */
export const GUIDED_TEMPLATE = {
  notInternship: '这是线上模拟的岗位体验：公司、数据和材料都是虚构的。完成后得到的「体验完成记录」只表示你完成了这次模拟体验，不是实习经历、能力认证，也不代表任何企业的录用意向。',
  role: {
    problem: '（请填写）这个岗位解决什么问题，用一两句话说清楚。',
    week: [{ when: '周一', what: '（请填写）典型的一天 / 一周做什么' }, { when: '周五', what: '（请填写）' }],
    tools: ['（请填写）常用工具或材料'],
    deliverables: ['（请填写）常见产出'],
    hard: ['（请填写）难点或需要权衡的地方'],
    interests: ['（请填写）对什么感兴趣的人可能会喜欢'],
    caveat: '不同公司的分工差别很大，这里介绍的是常见的一种，不是唯一标准。'
  },
  demo: {
    title: '（请填写）示范案例标题',
    background: '（请填写）示范案例的背景',
    materials: [{ id: 'd1', title: '（请填写）示范材料', kind: 'text', text: '（请填写）材料内容' }],
    thinking: [{ step: '（请填写）第一步想什么', text: '（请填写）' }],
    output: '（请填写）示例成果',
    glossary: []
  },
  brief: {
    role: '（请填写）你在任务里的角色',
    situation: '（请填写）现在的情况',
    materials: [{ id: 'm1', title: '材料 1：（请填写）', kind: 'table', columns: ['列 1', '列 2'], rows: [['…', '…']], note: '数据为虚构。' }],
    deliverable: ['（请填写）要交什么'],
    constraints: [],
    help: ['可以随时看提示和术语解释']
  },
  practice: [{
    id: 'p1', title: '（请填写）第一小步', prompt: '（请填写）这一步要做什么', hints: ['（请填写）提示 1'], framework: '', terms: [],
    fields: [{ id: 'p1.answer', label: '（请填写）作答框标题', kind: 'textarea' }]
  }],
  reference: {
    output: [{ heading: '（请填写）', text: '（请填写）参考成果' }],
    why: ['（请填写）为什么这样想'], alternatives: ['（请填写）其他合理的做法'], pitfalls: ['（请填写）常见误区'], missing: ['（请填写）真实工作中还需要的信息'],
    checklist: ['（请填写）自查项']
  },
  glossary: [],
  related: { jobs: [], experiences: [] }
};
export const SIMPLE_TEMPLATE = {
  scene: '（请填写）情境：你是谁、遇到了什么事。数据为虚构。',
  tasks: [{ title: '（请填写）任务标题', prompt: '（请填写）要回答什么', options: ['（请填写）选项 A', '（请填写）选项 B'], reference: '（请填写）参考思路：不是唯一答案' }]
};
/* JSON 路径翻译成中文，便于看懂校验错误。 */
const NAMES: Record<string, string> = {
  guide: '章节内容', role: '认识岗位', demo: '示范', brief: '模拟任务', practice: '作答小步', reference: '参考思路', glossary: '术语表', related: '相关推荐',
  materials: '材料', thinking: '思考过程', week: '典型一周', fields: '作答框', options: '选项', hints: '提示', checklist: '自查清单', output: '成果', tasks: '任务',
  title: '标题', prompt: '题目', text: '内容', label: '作答框标题', id: '编号', kind: '类型', deliverable: '要交什么', situation: '情况', problem: '解决什么问题', scene: '情境',
  willDo: '将体验的工作', learn: '能学到什么', minutes: '时长', direction: '职业方向', level: '入门程度', about: '简介', data: '', notInternship: '「不是实习」说明', caveat: '补充说明', background: '背景'
};
export function readablePath(path: string) {
  return path.split('.').filter(Boolean).map(x => /^\d+$/.test(x) ? `第 ${Number(x) + 1} 项` : (NAMES[x] ?? x)).filter(Boolean).join(' › ');
}
