/* 「你的隐藏工位搭子」趣味情境探索：题目、选项、角色映射与结果文案（全部配置在这里，界面和规则只读取它）。
   这是娱乐产品设计，不是心理测量：没有效度验证，不判断人格或职业能力，不用于企业筛选、能力评分或岗位实践完成记录。
   规则说明见 docs/V1.7-隐藏工位搭子-规则说明.md；改动本文件后请运行 npm test（会重新检查可达路径与分布）。 */

export type RoleId = 'fox' | 'otter' | 'collie' | 'cat' | 'squirrel' | 'seal' | 'raccoon' | 'octopus' | 'owl' | 'penguin' | 'rabbit' | 'hedgehog' | 'platypus';
export type RegularId = Exclude<RoleId, 'platypus'>;

export type Role = {
  id: RoleId; name: string; line: string;
  /** 图标文件（public/buddy/icons/ 下）；source 用于许可标注 */
  icon: string; iconSource: 'noto' | 'original';
  /** 结果页：「在这次情境中，你……」开头的优势表现，和一个可能的取舍 */
  strength: string; tradeoff: string;
  /** 区分题里代表这个角色的选项（隐藏角色没有） */
  tiebreak?: string;
  /** 推荐的岗位体验：id 必须是站内真实存在的体验；找不到时界面改为跳到体验列表。
      界面按体验类型标明「简版练习」（只有任务和参考思路，没有成果页）或「完整实践」（有复盘，可保存成果）。
      推荐的是简版练习时，再用 full 给一个完整实践。 */
  rec: { id: string; why: string; full?: { id: string; why: string } };
};

export const ROLES: Role[] = [
  { id: 'fox', name: '开十个标签页的狐狸', line: '等一下，还有一种可能。', icon: 'fox.png', iconSource: 'noto',
    strength: '在这次情境中，你会主动把几种可能都摊开，不急着锁定第一个答案。',
    tradeoff: '选项开得越多，收拢需要的时间越长；时间紧的时候，可能要先定下一个再说。',
    tiebreak: '把这次没来得及试的几个方向记下来，留给下次',
    rec: { id: 'my-quick', why: '几类用户里先服务谁，正适合先把可能性摊开，再收拢成一个选择。', full: { id: 'ai-eval', why: '同样是 AI 产品运营：比较两个 AI 回答，写一份自己的评测标准。' } } },
  { id: 'otter', name: '正在潜水的水獭', line: '没回消息，但快查明白了。', icon: 'otter.png', iconSource: 'noto',
    strength: '在这次情境中，你倾向先把事情查清楚再开口，交出来的东西比较扎实。',
    tradeoff: '埋头查的时候，别人不知道你进展到哪了，可能会以为你掉线了。',
    tiebreak: '把还没核对完的那组数据，再从头核一遍',
    rec: { id: 'ops-returns-deep', why: '6 周数据、退货原因、评论和变更记录都在，够你潜下去查个明白。' } },
  { id: 'collie', name: '叼着 Demo 的边牧', line: '你们先聊，我做了一个。', icon: 'collie.png', iconSource: 'original',
    strength: '在这次情境中，你习惯先做出一个能看的东西，让讨论有了具体的对象。',
    tradeoff: '做得快，有时会跑在大家对齐之前，返工的可能也会多一点。',
    tiebreak: '顺手把方案做成一个能点开的小样',
    rec: { id: 'ops-returns', why: '8 分钟内先拿出一份行动方案，做完马上看到复盘。' } },
  { id: 'cat', name: '自带时区的猫', line: '我有我的进度条。', icon: 'cat.png', iconSource: 'noto',
    strength: '在这次情境中，你会守住自己的节奏，在不被打断的时间里把重要的部分做扎实。',
    tradeoff: '节奏和团队不同步时，别人可能要等你，也不确定什么时候能等到。',
    tiebreak: '关掉消息提醒，安安静静把自己那部分收好尾',
    rec: { id: 'ai-eval', why: '按自己的节奏，一条一条比较两个 AI 回答，再写下你的评测标准。' } },
  { id: 'squirrel', name: '口袋塞满 Plan B 的松鼠', line: '别慌，我还留了一手。', icon: 'squirrel.png', iconSource: 'noto',
    strength: '在这次情境中，你会提前想到可能出岔子的地方，手里留着替代方案。',
    tradeoff: '准备备选也要花时间，有时会分走主线上的精力。',
    tiebreak: '把所有文件再备份一份，顺便想想下次可能卡在哪',
    rec: { id: 'yc-std', why: '先算清一单能赚多少，再读两周数据，提前看出哪里可能出问题。', full: { id: 'ops-returns', why: '同一个岗位方向：利润变少了，组合几项行动并说明还缺什么。' } } },
  { id: 'seal', name: '给大家留气口的海豹', line: '先喘口气，事情还能解决。', icon: 'seal.png', iconSource: 'noto',
    strength: '在这次情境中，你会留意大家的状态，在紧张的时候给团队留出喘口气的空间。',
    tradeoff: '照顾大家节奏的时候，一些难开口的话可能会被往后放。',
    tiebreak: '跟每个组员说声辛苦了，顺便问问大家这周感觉怎么样',
    rec: { id: 'xt-std', why: '先听清客户真正担心什么，再一条条判断哪些事能交给 AI。', full: { id: 'ai-eval', why: '站在用户的角度，比较两个 AI 回答哪个更合适。' } } },
  { id: 'raccoon', name: '什么都想拆开的浣熊', line: '让我看看它到底怎么工作的。', icon: 'raccoon.png', iconSource: 'noto',
    strength: '在这次情境中，你想弄明白事情背后是怎么运转的，常常能摸到真正的原因。',
    tradeoff: '拆得太深的时候，可能会离当下要交的东西远一点。',
    tiebreak: '研究一下这周哪个环节最费时间，到底卡在了哪',
    rec: { id: 'yc-quick', why: '从一条差评出发，拆开看问题到底出在哪个环节。', full: { id: 'ops-returns-deep', why: '6 周数据、退货原因和变更记录，完整拆一遍退货率为什么上升。' } } },
  { id: 'octopus', name: '同时伸出八只手的章鱼', line: '这边我接，那边我也能搭一下。', icon: 'octopus.png', iconSource: 'noto',
    strength: '在这次情境中，你愿意同时接住好几块，哪里缺人就往哪里搭一把。',
    tradeoff: '手伸得多，每一块能分到的时间就少，自己也容易累。',
    tiebreak: '帮还没做完的同学收尾，顺手把共享文件也整理好',
    rec: { id: 'ops-returns', why: '利润、退货、广告要一起看，再组合出几项行动。' } },
  { id: 'owl', name: '半夜突然想通的猫头鹰', line: '刚才那件事，我想明白了。', icon: 'owl.png', iconSource: 'noto',
    strength: '在这次情境中，你会把事情放一放、再回头想，常常在之后想到更好的说法。',
    tradeoff: '想通的时间不一定刚好赶在截止前，需要给自己提前留出余地。',
    tiebreak: '先什么都不急着做，让脑子把这周的事慢慢过一遍',
    rec: { id: 'ai-eval', why: '两个回答哪个更好，没有标准排序，适合想一想再写下你的判断。' } },
  { id: 'penguin', name: '自带集合点的企鹅', line: '我们先确认一下，去哪儿集合。', icon: 'penguin.png', iconSource: 'noto',
    strength: '在这次情境中，你会先确认大家要去同一个地方，让分工和目标对得上。',
    tradeoff: '确认和同步也要花时间，节奏快的人可能会觉得有点慢。',
    tiebreak: '在群里发一条：下次什么时候、在哪儿碰头',
    rec: { id: 'my-quick', why: '资源有限的时候，先说清楚这个月优先服务哪类用户。', full: { id: 'ai-eval', why: '先和用户需求对齐，再定一份大家都能用的评测标准。' } } },
  { id: 'rabbit', name: '耳朵先收到消息的兔子', line: '你们有没有注意到这个变化？', icon: 'rabbit.png', iconSource: 'noto',
    strength: '在这次情境中，你对变化很敏感，常常比别人更早注意到不对劲的地方。',
    tradeoff: '提醒得早，信息有时还没核实完，需要再补上一句依据。',
    tiebreak: '刷一圈群消息和评论，看看大家对这次汇报怎么说',
    rec: { id: 'yc-quick', why: '一条差评里藏着的信号，你可能会比别人先听到。', full: { id: 'ops-returns', why: '订单涨了利润却少了一半，从材料里找出变化。' } } },
  { id: 'hedgehog', name: '有边界的小刺猬', line: '能做，但有件事得先说清楚。', icon: 'hedgehog.png', iconSource: 'noto',
    strength: '在这次情境中，你会在开始前把范围和条件说清楚，让大家知道能做到哪一步。',
    tradeoff: '边界说得清楚，有时也会让人觉得你不太好商量。',
    tiebreak: '写下这次哪些事超出了当初的约定，下次开工前先说好',
    rec: { id: 'xt-std', why: '哪些问题能交给 AI、哪些必须转人工，边界要先划清楚。', full: { id: 'ai-eval', why: '先定清楚评测标准，再判断哪个回答更合适。' } } },
  { id: 'platypus', name: '不按物种出牌的鸭嘴兽', line: '你给了三个选项，我找到了第四条路。', icon: 'platypus.png', iconSource: 'original',
    strength: '在这次情境中，你好几次没有在给出的方向里选，而是自己找了另一条路。',
    tradeoff: '新路需要花时间解释和验证，大家也可能要一点时间才能跟上你。',
    rec: { id: 'xt-std', why: '先别急着给方案，先帮客户把问题找对，正适合换个角度看。', full: { id: 'ops-returns-deep', why: '完整版最后有一组新数据的迁移练习，正好换个角度再做一次。' } } },
];

export type Option = { id: string; text: string; w: Partial<Record<RegularId, number>>; detour?: boolean };
export type Scenario = { id: string; stage: string; from: string; message: string; ask: string; options: Option[] };

/* 一个连贯的小项目：实习第三周，4 人小组周一到周五做「开学季校园推广」方案，原定周五下午三点汇报（周四被提前到周五早上九点）。
   人物和情节都是虚构的。每个选项给 1 个角色 +2 分、另 1 个角色 +1 分；标 detour 的选项同时计入「另辟蹊径」次数。
   选项 id 是固定的语义名（计分、存储、依据都只认 id），数组顺序就是页面上的显示顺序；
   6 个 detour 选项故意分散在不同位置（第 3、1、4、2、3、1 个），不要都挪到同一个位置。 */
export const PROJECT = '实习第三周，你所在的 4 人小组接到一个任务：周一到周五，为一款学习 App 准备「开学季校园推广」方案，周五下午三点向主管汇报。';

export const SCENARIOS: Scenario[] = [
  { id: 's1', stage: '接任务', from: '组长 小周', message: '主管要一份开学季校园推广方案，周五下午三点汇报。具体要什么，她没多说。', ask: '你先做什么？', options: [
    { id: 'rough-frame', text: '先搭一页粗框架发到群里，让大家对着改', w: { collie: 2, octopus: 1 } },
    { id: 'ask-scope', text: '先去问清楚：要交成什么样，哪些不用做', w: { hedgehog: 2, cat: 1 } },
    { id: 'sync-meeting', text: '拉大家开十分钟短会，先对齐目标和分工', w: { penguin: 2, seal: 1 } },
    { id: 'read-history', text: '先去翻往年的方案和数据，弄明白了再开口', w: { otter: 2, raccoon: 1 } },
  ] },
  { id: 's2', stage: '找材料', from: '组员 阿杰', message: '资料一下子多了：竞品活动、社媒讨论、往年数据、学校社团名单，全堆在共享文件夹里。', ask: '这堆材料，你怎么处理？', options: [
    { id: 'recent-talk', text: '先看最近两周大家都在聊什么，有没有新变化', w: { rabbit: 2, fox: 1 } },
    { id: 'one-case', text: '挑一个最像的成功案例，拆到底，看它为什么有效', w: { raccoon: 2, otter: 1 } },
    { id: 'talk-students', text: '先不看资料，去找三个在校生直接聊十分钟', w: { rabbit: 2, raccoon: 1 }, detour: true },
    { id: 'many-sources', text: '多开几个来源，先把面铺开再说', w: { fox: 2, rabbit: 1 } },
  ] },
  { id: 's3', stage: '探索方案', from: '组员 小林', message: '我们想出了三个方向：A 和社团合作，B 去宿舍楼地推，C 在小红书发起打卡挑战。', ask: '接下来你会……', options: [
    { id: 'remix-a-c', text: '把 A 和 C 拆开重组：让社团来发起打卡挑战', w: { raccoon: 2, owl: 1 }, detour: true },
    { id: 'prototype-all', text: '三个都先做个小样，摆在一起比一比', w: { collie: 2, octopus: 1 } },
    { id: 'safe-with-backup', text: '选最稳的 A，同时把 C 留作备选', w: { squirrel: 2, otter: 1 } },
    { id: 'more-directions', text: '等一下，可能还有没想到的方向', w: { fox: 2, owl: 1 } },
  ] },
  { id: 's4', stage: '发现错误', from: '你自己', message: '周三晚上，你发现 PPT 里最关键的数字用的是「累计注册数」，不是「月活跃用户」。', ask: '你会……', options: [
    { id: 'recalc-first', text: '先自己重算一遍，弄清影响有多大再说', w: { otter: 2, cat: 1 } },
    { id: 'tell-owner', text: '先私下告诉做这页的同学，让他自己来改', w: { seal: 2, penguin: 1 } },
    { id: 'flag-in-group', text: '马上在群里说，附上截图和数据出处', w: { rabbit: 2, hedgehog: 1 } },
    { id: 'fix-then-evidence', text: '先跟大家说明口径用错了、改成月活，再另找一份更能说明问题的证据', w: { owl: 2, fox: 1 }, detour: true },
  ] },
  { id: 's5', stage: '协调分歧', from: '群聊', message: '周四上午，两位组员为「社团合作」还是「打卡挑战」争了起来，语气有点冲。', ask: '你会……', options: [
    { id: 'back-to-brief', text: '回到主管的要求，看哪个方向更对得上', w: { penguin: 2, hedgehog: 1 } },
    { id: 'third-way', text: '找一个两人都没提的做法，把双方最在意的都装进去', w: { fox: 2, octopus: 1 }, detour: true },
    { id: 'pause-reasons', text: '先停一停，让大家各写三条理由，午饭后再聊', w: { seal: 2, owl: 1 } },
    { id: 'both-pages', text: '两个都做成一页，交给主管来选', w: { octopus: 2, squirrel: 1 } },
  ] },
  { id: 's6', stage: '时间缩短', from: '主管', message: '周四下午：临时有变，汇报从周五下午三点提前到周五早上九点。', ask: '你会……', options: [
    { id: 'own-pace', text: '按自己的节奏，先把最重要的那页做扎实', w: { cat: 2, otter: 1 } },
    { id: 'split-tonight', text: '今晚大家分头赶，我多接两块', w: { octopus: 2, collie: 1 } },
    { id: 'summary-first', text: '问主管能不能早上先讲一页摘要，完整版下午原时间再补', w: { squirrel: 2, cat: 1 }, detour: true },
    { id: 'cut-scope', text: '砍掉一部分，把核心讲清楚，并写明哪些没做', w: { hedgehog: 2, penguin: 1 } },
  ] },
  { id: 's7', stage: '应对意外', from: '组员 阿杰', message: '周五早上八点半：演示要用的在线文档打不开了！', ask: '你会……', options: [
    { id: 'whiteboard', text: '干脆不用文档，改成在白板上边画边讲', w: { collie: 2, owl: 1 }, detour: true },
    { id: 'backup-pdf', text: '拿出昨晚导出的 PDF 和截图，直接换上', w: { squirrel: 2, cat: 1 } },
    { id: 'ask-around', text: '马上在群里问一圈，确认谁那里有能用的版本', w: { penguin: 2, rabbit: 1 } },
    { id: 'calm-team', text: '先跟大家说别慌，开场我先口头撑一下', w: { seal: 2, octopus: 1 } },
  ] },
  { id: 's8', stage: '完成复盘', from: '主管', message: '方向可以，细节再打磨一下。', ask: '汇报结束后，你会……', options: [
    { id: 'ask-details', text: '去问清楚「细节」具体指哪几处', w: { raccoon: 2, rabbit: 1 } },
    { id: 'own-notes', text: '按自己的方式记下来，过两天有空再整理', w: { cat: 2, owl: 1 } },
    { id: 'sleep-on-it', text: '晚上自己再想一遍，第二天发几条想明白的', w: { owl: 2, otter: 1 } },
    { id: 'set-boundaries', text: '列出这次卡住的地方，下次开工前先说好边界', w: { hedgehog: 2, cat: 1 } },
  ] },
];

/* 区分题：第一名并列时出现，列出全部并列角色各自的做法（不截断，不显示动物名）。 */
export const TIEBREAK = { stage: '收尾', from: '你自己', message: '周五下午，项目告一段落，离下班还有一个小时。', ask: '这一个小时，你最可能在做什么？' };

/* 题目与规则版本：改了题目、选项、加分或判定规则，就要改这个版本号，并在下面记一笔。
   本机进度和结果会记下当时的版本；版本不一致时，界面不会用新规则重算旧作答，而是保留旧结果并提示可以按新题目重做（见 store.ts）。 */
export const RULES_VERSION = 'v2';
export const RULES_CHANGELOG: { version: string; date: string; note: string }[] = [
  { version: 'v1', date: '2026-11-11', note: '首版，只在本地预览包里出现过（提交 b9a8bb5–48b26ef），没有上线。选项 id 是 a–d。' },
  { version: 'v2', date: '2026-11-11', note: '选项改用固定的语义 id；6 个「另辟蹊径」选项分散到不同位置；第 4 题替代证据选项改为先纠正口径；时间线改为周五下午汇报、周四通知提前到周五上午；并列第一的角色全部进入区分题。' },
];

export const RULES = {
  /** 第一名和第二名相差不超过这个分数，就算「结果接近」，追加区分题（0 = 只有并列才算） */
  closeMargin: 0,
  /** 「另辟蹊径」选项（detour）至少选了几次，触发隐藏角色。只看行为组合，不看分数高低。 */
  hiddenMinDetours: 4,
};

/* 角色顺序只决定区分题里选项的排列位置，不决定谁能进入区分题（并列的全部列出）。 */
export const REGULAR_IDS = ROLES.filter(r => r.id !== 'platypus').map(r => r.id as RegularId);
export const roleById = (id: RoleId) => ROLES.find(r => r.id === id)!;
export const DISCLAIMER = '情境娱乐探索，非专业人格或职业测评。';
export const USE_LIMIT = '结果只供娱乐和自我探索：不用于企业筛选、能力评分，也不算岗位实践完成记录。';
