/* V1.6 第二个完整体验：AI 产品与运营——「4 个 AI 回答，怎样判断哪个更适合这位用户？」
   6 步引导结构，复用现有体验组件。成果：一份评测标准与案例分析。
   所有回答都是平台人工编写的教学样例，不是任何真实 AI 模型的输出，也不是测试结果。
   Excel 相关事实依据 Microsoft Support 公开页面，示范里的科普事实依据 NASA Space Place（2026-11-11 查阅）。
   本体验没有经过 AI 产品或评测从业者审核。 */

const TAGS = ['事实错误', '没有完成用户的任务', '遗漏关键原因或步骤', '不适合用户的环境', '重点不突出、太长', '没发现明显问题'];
const tagCheck = (expect: string[], explain: string, why: Record<string, string>) => ({ kind: 'choices' as const, expect, tol: 0, unit: '', alt: [], explain, why });

const USER_Q = '我是财务管理专业大三学生，在一家公司实习，用的是公司电脑上的 Excel 2016。我要把 300 行订单编号匹配到价格表里，明早 10 点前交给主管。\n公式写的是 =VLOOKUP(A2,价格表!A:C,3,FALSE)，但有一半显示 #N/A。我注意到这些订单编号的单元格左上角有个绿色小三角。是哪里出问题了？怎么改？';

export const ANSWERS = {
  A: '#N/A 表示 VLOOKUP 没找到匹配值。常见原因有四种：\n1. 查找值不在查找区域的第一列。\n2. 第 4 个参数是 TRUE 或省略，会用近似匹配，应改成 FALSE。\n3. 查找值和查找区域的数据类型不一致，比如一边是数字、一边是存储为文本的数字。\n4. 单元格里有多余的空格，可以用 TRIM 去掉。\n另外，如果数据量很大，建议学习 INDEX + MATCH 组合，它比 VLOOKUP 更灵活，可以向左查找。（后面还有约 400 字介绍 INDEX + MATCH 的原理和写法，这里省略。）',
  B: '把公式改成 =IFERROR(VLOOKUP(A2,价格表!A:C,3,FALSE),"") 就不会显示 #N/A 了。',
  C: '别急，这个问题很常见。绿色小三角说明这些订单编号是「存储为文本的数字」，而价格表里的编号是真正的数字，Excel 认为它们不一样，所以找不到。\n解决办法：\n1. 选中订单编号这一列，点旁边出现的感叹号，选「转换为数字」。\n2. 记得把 VLOOKUP 的第 4 个参数改成 TRUE，这样才是精确匹配。\n改完以后，#N/A 应该就消失了。',
  D: '建议直接换用 XLOOKUP：=XLOOKUP(A2,价格表!A:A,价格表!C:C)。XLOOKUP 默认就是精确匹配，比 VLOOKUP 更好用，也不用数第几列。'
};

export const aiEval = {
  title: '4 个 AI 回答，哪个更适合这位用户？做一份评测标准', direction: 'AI 产品运营', minutes: 40, format: 'guided', sourceType: 'platform',
  level: '入门 · 不需要编程，会一点 Excel 更好',
  about: 'AI 产品上线前，运营要判断「什么样的回答才算好」。你会先看一次完整示范，再给一位实习生的求助（人工编写的教学样例）评估 4 个候选回答：它们各有优点，也各有问题。最后交出一份评测标准与案例分析。',
  deliverable: '一份评测标准与案例分析（可打印、可导出）',
  willDo: ['先弄清用户是谁、真正要什么', '定一套评测标准，分清哪条是一票否决', '用参考资料核对 4 个回答，引用证据下判断', '换一个用户，看看标准和排序怎么变'],
  learn: ['AI 产品运营做评测时在做什么', '怎么判断事实准确、任务完成和信息遗漏', '为什么同一个回答，换一个用户好坏会变'],
  guide: {
    notInternship: '这是线上模拟的岗位体验。用户提问和 4 个回答都是平台人工编写的教学样例，不是任何真实 AI 模型的输出，也不是测试结果。完成后得到的成果只表示你做了一次模拟练习，不是实习经历或能力认证。',
    review: '未经 AI 产品或评测从业者审核',
    role: {
      problem: 'AI 产品运营负责让 AI 产品「答得对、帮得上、用户愿意继续用」。其中常见的一块工作是评测：定标准、看大量对话、找出问题，再推动产品和算法同事改进。',
      week: [
        { when: '周一', what: '看上周的用户反馈和差评对话，挑出典型问题。' },
        { when: '周二到周三', what: '按评测标准抽样打标：这个回答对不对、有没有帮到用户、漏了什么。' },
        { when: '周四', what: '和产品、算法同事复盘：哪类问题最多，先改哪一类。' },
        { when: '周五', what: '写评测周报：问题分布、典型案例、改进建议。' }
      ],
      tools: ['对话日志和用户反馈', '评测表格或标注平台', '产品文档和知识库', '可靠的外部资料（官方文档等）'],
      deliverables: ['评测标准', '问题清单和典型案例', '评测周报', '改进建议'],
      hard: ['一个回答常常有优点也有缺点，要说清楚取舍。', '要懂一点业务知识，才能判断回答对不对。', '标准不统一，不同人打的结果会不一样。', '不能只看字数、语气或格式好不好看。'],
      interests: ['喜欢较真、挑错', '对 AI 产品感兴趣', '愿意查资料核对', '能站在用户角度想问题'],
      caveat: '不同公司对这个岗位的叫法和分工差别很大（AI 产品运营、AI 训练师、评测专员等）。这里介绍的是常见的一种做法。'
    },
    demo: {
      title: '示范：给初中生解释「天空为什么是蓝色」',
      background: '一款面向初中生的科普问答产品（虚构）收到提问：「为什么天空是蓝色的？」团队人工编写了 3 个候选回答，用来演示怎么评测。用户是初中二年级学生。',
      materials: [
        { id: 'd1', title: '候选回答', kind: 'list', items: ['回答 X：因为天空反射了大海的颜色。', '回答 Y：阳光里混着各种颜色的光。阳光穿过大气时，会被空气里很小的气体分子向四面八方散开，蓝光的波长短，被散开得最多，所以我们抬头看到满天都是蓝色。', '回答 Z：这是瑞利散射。散射强度与波长的四次方成反比，因此短波长的蓝光散射强度显著高于长波长的红光……'], note: '教学样例，平台人工编写。' },
        { id: 'd2', title: '参考资料（摘要）', kind: 'text', text: 'NASA Space Place《Why Is the Sky Blue?》：阳光到达地球大气后，被空气中微小的分子向各个方向散射；蓝光波长较短，散射得最多，所以我们大部分时候看到蓝色的天空。\n来源：https://spaceplace.nasa.gov/blue-sky/（2026-11-11 查阅）' }
      ],
      thinking: [
        { step: '先看用户是谁、要什么', text: '初中二年级学生，想要一个听得懂、而且是对的解释。' },
        { step: '定标准，分清一票否决', text: '事实准确是一票否决：科普讲错了，后面再好懂也没用。然后是「这个年龄能听懂」，再然后是简洁。' },
        { step: '用可靠资料核对', text: '对照 NASA 的说明：X 说「反射大海」，和资料不符，是事实错误。Y 和 Z 都和资料一致。' },
        { step: '按标准比较，说清取舍', text: 'Y 准确、好懂；Z 准确，但「四次方成反比」对初中生太难。所以 Y > Z > X。' },
        { step: '想一想换个用户会怎样', text: '如果用户是大学物理课的学生，Z 的术语和公式反而更有用，排序可能变成 Z > Y > X。标准没变，但每条标准的重要程度变了。' }
      ],
      output: '评测标准（示例）：\n1. 事实准确（一票否决）：和可靠资料一致。\n2. 适合用户：初中生能听懂。\n3. 简洁：不绕弯。\n结论：Y > Z > X。X 有事实错误；Z 准确但对初中生太难；Y 准确又好懂。',
      glossary: [{ term: '一票否决', def: '只要出现这个问题，不管其他方面多好，都不能算好回答。' }]
    },
    lessons: [
      { id: 'E1', title: '事实准确：先用可靠资料核对', point: '只要有一条会让用户照着做错的事实，就要先指出来。核对要找可靠来源，比如官方文档、权威机构，不要凭感觉。', example: '示范里，X 说天空是「反射大海」，和 NASA 的说明不符。' },
      { id: 'E2', title: '任务完成：看用户真正要的结果', point: '回答有没有回应字面上的问题不算数，要看用户真正要的结果做到了没有。', example: '用户要的是「匹配出价格」。只让 #N/A 不显示，没有完成这件事。' },
      { id: 'E3', title: '信息遗漏：没说错，也可能帮不上', point: '回答里每句话都对，但漏掉了用户最需要的那一步，用户照样做不成。', example: '列了一堆原因，却没把用户给出的线索（绿色小三角）对上最可能的那一条。' },
      { id: 'E4', title: '场景决定标准的重要程度', point: '同样一套标准，换一个用户，哪条更重要就会变：新手更需要步骤清楚，熟手更需要简洁；出错代价高的场景，准确和「错了能被发现」更重要。', example: '给初中生，Y 比 Z 好；给大学物理课，Z 可能更好。' },
      { id: 'E5', title: '每个判断都要有两处证据', point: '一处是回答里的原文，一处是参考资料里的依据。这样别人可以复核你的判断。', example: '「C 第 2 步说 TRUE 是精确匹配」+「VLOOKUP 文档：FALSE 为精确匹配」。' }
    ],
    brief: {
      role: '你是「知行学伴（虚构）」AI 学习助手团队的产品运营实习生。团队准备上线 Excel 答疑功能，负责人请你做一次评测。',
      situation: '下面是一位用户的求助场景（人工编写的教学样例），以及团队准备的 4 个候选回答。负责人要你：定一套评测标准，用它评估这 4 个回答，说明哪个最适合这位用户，并写成一份「评测标准与案例分析」。',
      materials: [
        { id: 'm1', title: '材料 1：用户的提问', kind: 'text', text: USER_Q, note: '教学样例，人工编写。' },
        { id: 'm2', title: '材料 2：4 个候选回答', kind: 'list', items: ['回答 A：' + ANSWERS.A, '回答 B：' + ANSWERS.B, '回答 C：' + ANSWERS.C, '回答 D：' + ANSWERS.D], note: '全部是平台人工编写的教学样例，不是任何真实 AI 模型的输出。' },
        { id: 'm3', title: '材料 3：参考资料摘要（可以点链接核对原文）', kind: 'list', items: [
          'Microsoft Support《VLOOKUP 函数》：要查找的值必须位于查找区域的第一列；第 4 个参数为 FALSE（或 0）表示精确匹配，TRUE 表示近似匹配；建议不要把数字或日期存储为文本。https://support.microsoft.com/zh-CN/Excel/functions/vlookup-function',
          'Microsoft Support《How to correct a #N/A error》：VLOOKUP 出现 #N/A 的常见原因包括数据类型不一致（一边是数字、一边是文本）、多余的空格、使用了近似匹配、查找值确实不存在；可以用 IFERROR 把错误显示成别的内容。https://support.microsoft.com/en-us/Excel/how-to-correct-a-n-a-error',
          'Microsoft Support《通过应用数字格式来修复文本格式的数字》：单元格左上角的绿色小三角表示数字存储为文本，可以用「转换为数字」修复。https://support.microsoft.com/zh-CN/Excel/fix-text-formatted-numbers-by-applying-a-number-format',
          'Microsoft Support《XLOOKUP 函数》：「XLOOKUP 在 Excel 2016 和 Excel 2019 中不可用。」https://support.microsoft.com/zh-CN/Excel/functions/xlookup-function'
        ], note: '摘要由平台整理，2026-11-11 查阅。以原文为准。' }
      ],
      deliverable: ['这位用户真正要什么，哪些信息会影响「好回答」的标准', '你的评测标准：哪几条最重要，哪条一票否决', '逐个评估 4 个回答，每个判断引用回答原文和参考资料', '你的排序和取舍；换一个用户时会怎样变', '还要验证或追问用户的信息'],
      constraints: ['这是模拟场景，用户和回答都是人工编写的教学样例。', '不需要真的打开 Excel，用参考资料核对即可。', '没有标准答案。参考思路只是一种合理的判断。'],
      help: ['每一步都有提示和方法要点。', '选标签的题可以「对照参考标注」，只比较你选的标签，不评价你写的理由。', '可以随时回看第 2 步的示范。']
    },
    practice: [
      { id: 'q1', title: '先弄清用户和任务', when: 'practice', lessons: ['E2', 'E4'], material: '',
        prompt: '读材料 1。这位用户真正要的结果是什么？什么样的回答才算「完成任务」？\n再选出会影响「好回答」标准的用户信息。',
        hints: ['她问的是「哪里出问题、怎么改」，但她真正要交的是什么？', '她给了好几条线索，有的会直接决定哪个回答能用。'], framework: '用户真正要的是 __。一个回答要算完成任务，至少要 __。', terms: ['VLOOKUP', '#N/A'],
        fields: [
          { id: 'q1.goal', label: '用户真正要什么？什么样的回答算完成任务？', kind: 'textarea', options: [], placeholder: '', required: true },
          { id: 'q1.facts', label: '哪些用户信息会影响「好回答」的标准（可多选）', kind: 'choices', options: ['用的是 Excel 2016', '明早 10 点前要交', '编号单元格有绿色小三角', '这是财务数据，出错代价高', '她是财务管理专业', '一共 300 行'], placeholder: '', required: true,
            check: tagCheck(['用的是 Excel 2016', '明早 10 点前要交', '编号单元格有绿色小三角', '这是财务数据，出错代价高'], '版本决定哪些函数能用；截止时间意味着要能马上照做；绿色小三角是最关键的诊断线索；财务数据出错代价高，「错了却看不出来」最危险。', {
              '用的是 Excel 2016': '决定了 XLOOKUP 能不能用。', '明早 10 点前要交': '她需要马上能照做的步骤，不是一堂长课。', '编号单元格有绿色小三角': '最直接的诊断线索：数字存储为文本。', '这是财务数据，出错代价高': '把错误藏起来、或者返回错误价格，比显示 #N/A 更危险。',
              '她是财务管理专业': '对理解有一点帮助，但不太改变「好回答」的标准。', '一共 300 行': '数据量不大，不影响方法选择。' }) }
        ] },
      { id: 'q2', title: '定评测标准', when: 'practice', lessons: ['E1', 'E2', 'E3', 'E4'], material: '',
        prompt: '针对这位用户，选出你的评测标准，说明哪几条最重要、怎么排序，以及哪条是「一票否决」。这一步没有参考标注：标准本身就需要你自己判断。',
        hints: ['回想示范：先有一票否决项，再排其他标准。', '这位用户要照着做、而且做的是财务数据，哪种问题最不能接受？'], framework: '一票否决：__，因为 __。\n其次：__ > __ > __。', terms: ['一票否决', '评测标准'],
        fields: [
          { id: 'q2.criteria', label: '你的评测标准（可多选）', kind: 'choices', options: ['事实准确', '完成用户的任务', '没有遗漏关键原因或步骤', '适合用户的环境和水平', '简洁、重点突出', '语气友好'], placeholder: '', required: true },
          { id: 'q2.weights', label: '对这位用户，哪几条最重要？怎么排序？为什么？', kind: 'textarea', options: [], placeholder: '', required: true },
          { id: 'q2.veto', label: '哪条是一票否决？为什么？', kind: 'textarea', options: [], placeholder: '', required: true }
        ] },
      { id: 'q3', title: '评估回答 A 和 B', when: 'practice', lessons: ['E1', 'E3', 'E5'], material: '回答 A：' + ANSWERS.A + '\n\n回答 B：' + ANSWERS.B,
        prompt: '给每个回答选出它的问题（可以多选），再写下证据：引用回答原文，并对照材料 3 的参考资料。',
        hints: ['A 有没有说错的地方？它有没有用上用户给的绿色小三角线索？', 'B 的公式能不能运行？运行以后，用户拿到价格了吗？'], framework: '回答 __ 的问题是 __。证据：回答原文「__」；参考资料：「__」。', terms: ['IFERROR'],
        fields: [
          { id: 'a.tags', label: '回答 A 的问题', kind: 'choices', options: TAGS, placeholder: '', required: true,
            check: tagCheck(['重点不突出、太长'], 'A 列的四个原因都和微软文档一致，第 3 条正好是这位用户的问题；但它没有用上「绿色小三角」这条线索，用户要自己从四条里猜，后面还有一大段和问题无关的 INDEX + MATCH 介绍。', {
              '事实错误': '四个原因都和微软文档一致。「第 4 个参数应改成 FALSE」也正确（虽然用户本来就用了 FALSE）。', '遗漏关键原因或步骤': '关键原因（数据类型不一致）列在第 3 条，没有遗漏；问题在于没有指出哪条最可能，也没有给具体的修复步骤。可以讨论。', '没有完成用户的任务': '用户照着第 3 条可以自己找到问题，但要多花工夫。可以讨论。', '没发现明显问题': '没有错，但对一个明早要交的用户来说，重点不突出。' }) },
          { id: 'a.ev', label: '回答 A 的证据和判断', kind: 'textarea', options: [], placeholder: '回答原文：「……」；参考资料：「……」', required: true },
          { id: 'b.tags', label: '回答 B 的问题', kind: 'choices', options: TAGS, placeholder: '', required: true,
            check: tagCheck(['没有完成用户的任务', '遗漏关键原因或步骤'], '公式本身能运行，确实不会再显示 #N/A；但匹配不到的那一半订单还是没有价格，只是变成了空白。它没有找原因，财务数据里少了价格还更难被发现。', {
              '事实错误': 'IFERROR 确实能把 #N/A 显示成空白，微软文档也提到这个用法，所以不算事实错误。问题在于它没解决用户的任务。', '不适合用户的环境': 'IFERROR 在 Excel 2016 里可以用。', '重点不突出、太长': 'B 很短。' }) },
          { id: 'b.ev', label: '回答 B 的证据和判断', kind: 'textarea', options: [], placeholder: '', required: true }
        ] },
      { id: 'q4', title: '评估回答 C 和 D', when: 'practice', lessons: ['E1', 'E3', 'E4', 'E5'], material: '回答 C：' + ANSWERS.C + '\n\n回答 D：' + ANSWERS.D,
        prompt: '同样，给 C 和 D 选出问题，写下证据。特别留意：哪个回答会让用户「看起来做对了，其实错了」？',
        hints: ['C 第 2 步说的 TRUE，在 VLOOKUP 文档里是什么意思？', 'D 推荐的函数，这位用户的 Excel 版本能用吗？就算能用，换了函数能解决绿色小三角的问题吗？'], framework: '', terms: ['精确匹配', 'XLOOKUP', '存储为文本的数字'],
        fields: [
          { id: 'c.tags', label: '回答 C 的问题', kind: 'choices', options: TAGS, placeholder: '', required: true,
            check: tagCheck(['事实错误'], 'C 的诊断最准，用上了绿色小三角线索，第 1 步也和微软文档一致；但第 2 步把 TRUE 说成精确匹配，文档里 FALSE 才是精确匹配。用户照做以后，公式会用近似匹配，可能返回错误的价格却不报错。', {
              '没有完成用户的任务': '如果第 2 步是对的，C 能完成任务；问题出在那条事实错误。', '遗漏关键原因或步骤': '可以讨论：C 没有提多余空格，但用户给的线索已经指向文本格式。', '没发现明显问题': '第 2 步和 VLOOKUP 文档不符。' }) },
          { id: 'c.ev', label: '回答 C 的证据和判断', kind: 'textarea', options: [], placeholder: '', required: true },
          { id: 'd.tags', label: '回答 D 的问题', kind: 'choices', options: TAGS, placeholder: '', required: true,
            check: tagCheck(['不适合用户的环境', '遗漏关键原因或步骤', '没有完成用户的任务'], '微软文档写明「XLOOKUP 在 Excel 2016 和 Excel 2019 中不可用」，用户用不了。就算能用，订单编号存储为文本的问题还在，换函数也照样匹配不上。', {
              '事实错误': '「XLOOKUP 默认精确匹配」本身是对的。问题是这位用户用不了，而且没有解决真正的原因。', '重点不突出、太长': 'D 很短。' }) },
          { id: 'd.ev', label: '回答 D 的证据和判断', kind: 'textarea', options: [], placeholder: '', required: true }
        ] },
      { id: 'q5', title: '下结论：排序和取舍', when: 'practice', lessons: ['E4'], material: '',
        prompt: '把 4 个回答排个序，说明理由，特别是有取舍的地方。这一题没有标准排序：和参考排序不同没关系，只要理由说得通。再想一想：如果只能改一个回答让它变成最好的，你改哪个、怎么改？',
        hints: ['「做不了」和「做错了却看不出来」，对财务数据哪个更危险？', '哪个回答离「最好」只差一步？'], framework: '排序：__ > __ > __ > __。\n最难排的是 __ 和 __，因为 __。', terms: [],
        fields: [
          { id: 'q5.rank', label: '你的排序', kind: 'text', options: [], placeholder: '例如：A > C > D > B', required: true },
          { id: 'q5.why', label: '为什么这样排？哪里有取舍？', kind: 'textarea', options: [], placeholder: '', required: true },
          { id: 'q5.fix', label: '如果只能改一个回答，你改哪个、怎么改？', kind: 'textarea', options: [], placeholder: '', required: true }
        ] },
      { id: 'q6', title: '还要验证什么', when: 'practice', lessons: ['E1'], material: '',
        prompt: '要确认你的判断，还需要查什么、或者追问用户什么？',
        hints: ['价格表里的编号真的是数字吗？用户没说。', '除了绿色小三角，还可能有多余的空格吗？'], framework: '', terms: [],
        fields: [{ id: 'q6.verify', label: '还要验证或追问什么', kind: 'textarea', options: [], placeholder: '', required: true }] },
      { id: 'q7', title: '迁移练习：换一个用户', when: 'transfer', lessons: ['E4'],
        material: '新场景：同样的问题、同样的 4 个回答。但这次提问的是一位用 Microsoft 365（最新版 Excel）的数据分析师，这只是她自己的练习文件，她说：「给我最快的办法就行。」',
        prompt: '换了用户，哪条标准的重要程度变化最大？新的排序是什么？',
        hints: ['XLOOKUP 在 Microsoft 365 里能用吗？', 'C 的那条事实错误，换了用户以后还是错的吗？'], framework: '', terms: [],
        fields: [
          { id: 'q7.shift', label: '哪条标准的重要程度变化最大', kind: 'choices', single: true, options: ['事实准确', '适合用户的环境和水平', '语气友好'], placeholder: '', required: true,
            check: tagCheck(['适合用户的环境和水平'], '换成 Microsoft 365 以后，XLOOKUP 能用了，D「不适合环境」的问题消失；熟手也更在意简洁。事实准确仍然是一票否决：C 的错误换了用户也还是错的。', {
              '事实准确': '事实准确一直是一票否决，不会因为换了用户就不重要。', '语气友好': '对熟手来说语气影响不大。' }) },
          { id: 'q7.rank', label: '新的排序和理由', kind: 'textarea', options: [], placeholder: '', required: true }
        ] }
    ],
    reference: {
      output: [
        { heading: '用户与任务', text: '用户要在明早前，把 300 行订单的价格匹配出来，而且是财务数据。好回答要做到：指出最可能的原因，给出她在 Excel 2016 里马上能照做的步骤，并且不能让数据「看起来对、其实错」。' },
        { heading: '评测标准', text: '一票否决：事实错误（尤其是照做会得到错误结果的）。\n其次：完成任务 > 没有遗漏关键原因 > 适合用户环境 > 简洁 > 语气。\n这位用户出错代价高、时间紧，所以「错了能不能被发现」也要考虑。' },
        { heading: '逐个评估', text: 'A：内容都对，关键原因在第 3 条，但没用上绿色小三角线索，篇幅长，重点不突出。\nB：只把错误藏起来，没有完成任务；财务数据里少了价格更难被发现。\nC：诊断最准、步骤最清楚，但第 2 步把 TRUE 说成精确匹配，是事实错误；照做可能返回错误价格却不报错。\nD：XLOOKUP 在 Excel 2016 不可用；就算能用，文本格式的问题还在。' },
        { heading: '排序与取舍', text: '参考排序只是一种合理判断，不是评分依据：你的排序和它不同，只要理由说得通就是合理的；系统不会按排序判断你的能力，也不会因此不让你保存成果。\n参考排序：A > D > C > B。\nA 没有错，用户能自己找到原因。D 和 C 最难排：C 离最好只差一步，但照做会「静默出错」；D 用不了，但用户马上会发现（Excel 会报错）。财务场景更怕看不出来的错，所以参考把 D 放在 C 前面。如果是不涉及钱的个人练习，把 C 放在 D 前面也说得通。\n最值得改的是 C：把第 2 步改成「第 4 个参数保持 FALSE（精确匹配）」，C 就是最好的回答。' },
        { heading: '待验证', text: '价格表里的编号是不是数字；有没有多余空格；改完以后抽查几行价格是否对得上。' }
      ],
      why: ['先看用户真正要什么，再定标准，标准才不会空泛。', '用官方文档核对事实，而不是凭印象。', '分清「做不了」和「做错了看不出来」，后者在财务场景更危险。', '同一个回答，换了用户，好坏可能会变。'],
      alternatives: ['把 C 排在 A 前面也可以，前提是你明确说出「第 2 步必须改正」，并且把它当作改进建议，而不是直接上线。', '有人会把 B 排在 D 前面，理由是 B 至少能运行。但 B 让缺失的价格变得看不见，对财务数据风险更大，需要你说清楚为什么能接受。'],
      pitfalls: ['按语气或篇幅打分：C 语气最好，但有事实错误。', '只看回答有没有回应字面问题：B 确实让 #N/A 不显示了。', '凭印象判断事实，没有对照参考资料。', '标准写成「好不好」「全不全」这类空话，没说明对这位用户哪条最重要。'],
      missing: ['参考标注和参考排序只是一种合理判断，没有经过从业者审核。', '没有真实用户的后续反馈，不知道她最后用哪个回答解决了问题。'],
      checklist: ['我先说清了用户真正要的结果。', '我的标准里有一票否决项，并且说明了原因。', '每个判断都引用了回答原文和参考资料。', '我说明了排序里最难取舍的地方。', '我想到了换一个用户时标准会怎么变。']
    },
    glossary: [
      { term: 'VLOOKUP', def: 'Excel 里按某个值去另一张表查对应信息的函数，比如按订单编号查价格。' },
      { term: '#N/A', def: 'Excel 的一种错误值，表示「没找到」。' },
      { term: '精确匹配', def: 'VLOOKUP 第 4 个参数填 FALSE（或 0）时，只返回和查找值完全一致的结果。填 TRUE 是近似匹配。' },
      { term: '存储为文本的数字', def: '看起来是数字，但 Excel 把它当成文字。单元格左上角常有绿色小三角。和真正的数字比较时会被当成不一样。' },
      { term: 'IFERROR', def: '如果公式出错，就显示你指定的内容，比如空白。它会让错误「看不见」，但不会解决错误。' },
      { term: 'XLOOKUP', def: '较新版本 Excel 里的查找函数。微软文档写明它在 Excel 2016 和 2019 中不可用。' },
      { term: '评测标准', def: '判断回答好坏时依据的几条规则，也常叫 rubric。' },
      { term: '一票否决', def: '只要出现这个问题，不管其他方面多好，都不能算好回答。' }
    ],
    output: {
      title: '评测标准与案例分析',
      sections: [
        { heading: '用户与任务', fields: ['q1.goal', 'q1.facts'], hint: '' },
        { heading: '评测标准', fields: ['q2.criteria', 'q2.weights', 'q2.veto'], hint: '' },
        { heading: '逐个评估与证据', fields: ['a.tags', 'a.ev', 'b.tags', 'b.ev', 'c.tags', 'c.ev', 'd.tags', 'd.ev'], hint: '' },
        { heading: '结论与取舍', fields: ['q5.rank', 'q5.why', 'q5.fix'], hint: '' },
        { heading: '换一个用户时', fields: ['q7.shift', 'q7.rank'], hint: '' },
        { heading: '待验证信息', fields: ['q6.verify'], hint: '' }
      ]
    },
    provenance: [
      { kind: 'sim' as const, title: '用户提问、4 个候选回答、示范里的 3 个回答', detail: '平台人工编写的教学样例，不是任何真实 AI 模型的输出，也不是测试结果。「知行学伴」是虚构产品。', source: '', url: '', date: '' },
      { kind: 'public' as const, title: 'VLOOKUP 的精确匹配、查找列和文本数字', detail: '摘要并翻译自微软官方帮助页面。', source: 'Microsoft Support：VLOOKUP 函数', url: 'https://support.microsoft.com/zh-CN/Excel/functions/vlookup-function', date: '2026-11-11 查阅' },
      { kind: 'public' as const, title: '#N/A 的常见原因和 IFERROR', detail: '摘要并翻译自微软官方帮助页面。', source: 'Microsoft Support：How to correct a #N/A error', url: 'https://support.microsoft.com/en-us/Excel/how-to-correct-a-n-a-error', date: '2026-11-11 查阅' },
      { kind: 'public' as const, title: '绿色小三角和「转换为数字」', detail: '摘要自微软官方帮助页面。', source: 'Microsoft Support：通过应用数字格式来修复文本格式的数字', url: 'https://support.microsoft.com/zh-CN/Excel/fix-text-formatted-numbers-by-applying-a-number-format', date: '2026-11-11 查阅' },
      { kind: 'public' as const, title: 'XLOOKUP 在 Excel 2016 / 2019 中不可用', detail: '引用自微软官方帮助页面。', source: 'Microsoft Support：XLOOKUP 函数', url: 'https://support.microsoft.com/zh-CN/Excel/functions/xlookup-function', date: '2026-11-11 查阅' },
      { kind: 'public' as const, title: '示范：天空为什么是蓝色', detail: '摘要自 NASA 面向青少年的科普页面。', source: 'NASA Space Place：Why Is the Sky Blue?', url: 'https://spaceplace.nasa.gov/blue-sky/', date: '2026-11-11 查阅' }
    ],
    related: { jobs: [] as string[], experiences: ['ops-returns', 'ops-returns-deep'] }
  }
};
