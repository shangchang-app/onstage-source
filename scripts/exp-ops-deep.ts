/* V1.6：运营深度版（6 步）的教学加强。
   - 方法要点 5 条：合计算退货率、单数≠严重程度、同期≠因果、可验证假设、行动与效果判断
   - 热身小题（不同于示范和正式任务的材料）、可验证假设、行动效果判断
   - 迁移练习：换一组数据和业务条件（车载手机支架），用同样的方法再做一次
   - 数字类答案用规则检查（只核对数字），自由文字不做自动评价
   示范（手机壳颜色）和正式任务（刹车片适配）使用不同的材料。所有店铺和数据都是模拟教学数据。 */

export const deepLessons = [
  { id: 'L1', title: '整体退货率要用合计数算', point: '整体退货率 = 退货数之和 ÷ 订单数之和。每周订单数不一样时，把每周的百分比直接平均，订单少的那一周会被「放大」。', example: 'A 周 100 单、退 10 单（10%）；B 周 900 单、退 27 单（3%）。两个百分比平均是 6.5%，但这两周其实是 1,000 单退了 37 单，整体退货率是 3.7%。' },
  { id: 'L2', title: '退货单数变多，不一定是问题变严重', point: '订单变多，退货单数自然也会变多。判断问题有没有变严重，要看退货率，或者某一类退货占订单的比例。', example: '订单从 400 涨到 800、退货从 20 涨到 40：退货单数翻倍，但退货率都是 5%，说明生意变大了，问题没有变严重。' },
  { id: 'L3', title: '同时发生的变化，不能直接证明谁是原因', point: '时间对得上，只说明「可能有关」。同一周发生好几件事时，要找能区分它们的证据：哪件事能解释占比最高的那类问题？有没有和它对不上的地方？', example: '第 4 周同时扩了适配车型、开了广泛匹配、降了价。降价能解释订单变多，但解释不了「车型不匹配」退货变多。' },
  { id: 'L4', title: '把猜测写成可验证的假设', point: '写成三句话：如果原因是 X，那么应该看到 Y；如果看到 Z，说明这个假设不成立。这样别人知道该去查什么数据，你也知道自己什么时候错了。', example: '如果是新增车型的适配信息有错，那么新增车型的退货率应该明显高于原有车型；如果两者差不多，这个假设就站不住。' },
  { id: 'L5', title: '选优先行动，并提前说好怎么判断有效', point: '优先做直接针对主要原因、成本低、一两周内能看到变化的事。每个行动写清楚：看什么指标、多久以后看、变成多少算有效。', example: '两周后，「车型不匹配」退货占订单的比例从 6.5% 降到 2% 以下，就说明修正适配信息起作用了。' }
];

const N = (expect: number, explain: string, alt: { value: number; text: string }[] = []) => ({ kind: 'number' as const, expect: [expect], tol: 0.1, unit: '%', alt, explain, why: {} });

export const deepPractice = [
  { id: 'p0', title: '热身：先用方法算一道小题', when: 'practice', lessons: ['L1'], material: '',
    prompt: '某店铺两周的数据：第 1 周 100 单、退货 10 单；第 2 周 900 单、退货 27 单。这两周的整体退货率是多少？\n（这组数据和示范、正式任务都不一样，只用来练习方法。）',
    hints: ['先把两周的退货数加起来，再把两周的订单数加起来。', '然后用退货总数 ÷ 订单总数。'], framework: '整体退货率 = (__ + __) ÷ (__ + __) = __%', terms: ['退货率'],
    fields: [{ id: 'p0.rate', label: '两周的整体退货率（写一个百分比）', kind: 'text', options: [], placeholder: '例如：12.3%', required: true,
      check: N(3.7, '(10 + 27) ÷ (100 + 900) = 37 ÷ 1,000 = 3.7%。', [{ value: 6.5, text: '6.5% 是两周百分比（10% 和 3%）的平均。第 2 周订单是第 1 周的 9 倍，直接平均会把订单少的第 1 周「放大」。' }]) }] },
  { id: 'p1', title: '算一算：退货率变了多少', when: 'practice', lessons: ['L1', 'L2'], material: '',
    prompt: '用材料 1 的数据，算出前 3 周和后 3 周的整体退货率（退货数之和 ÷ 订单数之和）。再看看同一时间，访问量和转化率有什么变化。\n退货单数从 33 涨到 110，能不能直接说明问题变严重了？在第三格里一起说说。',
    hints: ['前 3 周：退货 9 + 11 + 13，订单 210 + 236 + 251。', '不要把三周的退货率直接相加再除以 3：每周订单数不一样，要用总数来算。', '订单也涨了。要比较的是退货率，不是退货单数。'],
    framework: '前 3 周退货率约 __%，后 3 周约 __%。退货单数变多，是因为 __。同期访问量 __，转化率 __。', terms: ['退货率', '转化率'],
    fields: [
      { id: 'p1.before', label: '前 3 周整体退货率', kind: 'text', options: [], placeholder: '例如：约 4.7%', required: true, check: N(4.7, '(9 + 11 + 13) ÷ (210 + 236 + 251) = 33 ÷ 697 ≈ 4.7%。') },
      { id: 'p1.after', label: '后 3 周整体退货率', kind: 'text', options: [], placeholder: '', required: true, check: N(11.1, '(31 + 40 + 39) ÷ (318 + 344 + 329) = 110 ÷ 991 ≈ 11.1%。') },
      { id: 'p1.other', label: '退货单数变多说明了什么？访问量和转化率又有什么变化？', kind: 'textarea', options: [], placeholder: '', required: true }
    ] },
  { id: 'p2', title: '对时间：变化从什么时候开始', when: 'practice', lessons: ['L3'], material: '',
    prompt: '退货率从哪一周开始明显上升？对照材料 4，同一周发生了哪些变化？先全部列出来。\n注意：时间对得上，只说明「可能有关」，还不能说明谁是原因。',
    hints: ['看材料 1：退货率在哪两周之间跳了一大截？', '材料 4 里同一周有三件事，都可能有关系。'], framework: '', terms: [],
    fields: [{ id: 'p2.when', label: '从哪一周开始明显上升？同一周发生了哪些变化？', kind: 'textarea', options: [], placeholder: '', required: true }] },
  { id: 'p3', title: '读原因：买家在说什么', when: 'practice', lessons: ['L2', 'L3'], material: '',
    prompt: '看材料 2 和材料 3。哪一类退货原因最多？评论里有没有能和它对上的线索？也留意哪些评论说的是别的问题。',
    hints: ['算一算「和我的车型不匹配」占后 3 周退货的比例。', '评论里提到了具体车型。想想：这些车型可能是什么时候被加进适配表的？', '异响、外箱破损也是问题，但和退货原因里最大的那一类是同一件事吗？'], framework: '', terms: ['适配车型'],
    fields: [{ id: 'p3.main', label: '占比最高的退货原因，以及评论里的线索', kind: 'textarea', options: [], placeholder: '', required: true }] },
  { id: 'p4', title: '下判断：写成可验证的假设', when: 'practice', lessons: ['L3', 'L4'], material: '',
    prompt: '结合前三步，判断可能的原因，可以选不止一个，并写下依据。\n然后把你认为最可能的原因写成一个可验证的假设：如果是它，应该看到什么？看到什么说明你错了？',
    hints: ['「最可能的原因」要能解释占比最高的那一类退货。', '降价能解释订单变多，但能解释「车型不匹配」变多吗？', '「应该看到」要写成能拿数据查的东西，比如某一组的退货率明显更高。'], framework: '如果原因是 __，那么应该看到 __。如果看到 __，说明这个假设不成立。', terms: ['广泛匹配'],
    fields: [
      { id: 'p4.causes', label: '你认为可能的原因（可多选）', kind: 'choices', options: ['新增车型的适配数据有错', '广泛匹配广告带来了不精准的买家', '降价促销吸引了冲动购买', '产品质量下降', '物流出了问题'], placeholder: '', required: true },
      { id: 'p4.why', label: '你的依据：为什么是它，为什么不是另外几个', kind: 'textarea', options: [], placeholder: '', required: true },
      { id: 'p4.hif', label: '假设：如果原因是……', kind: 'text', options: [], placeholder: '例如：新增车型的适配信息有错', required: true },
      { id: 'p4.hsee', label: '那么应该看到……（能用数据查的现象）', kind: 'textarea', options: [], placeholder: '', required: true },
      { id: 'p4.hnot', label: '如果看到……，说明这个假设不成立', kind: 'textarea', options: [], placeholder: '', required: true }
    ] },
  { id: 'p5', title: '定行动：下周先做哪两件事', when: 'practice', lessons: ['L5'], material: '',
    prompt: '写出下周最优先做的两件事，说明为什么先做它们。再写清楚怎么判断有没有效果：看什么指标、多久以后看、变成多少算有效。',
    hints: ['优先做能直接针对主要原因、成本低、一两周内能看到变化的事。', '「降价」「加大广告」能解决车型不匹配吗？', '效果要写成具体的数：比如两周后某个比例从多少降到多少。'],
    framework: '第一件：__。因为 __。\n判断有效：__ 周后看 __，从 __ 变成 __ 以内算有效。', terms: [],
    fields: [
      { id: 'p5.first', label: '第一件事，以及为什么先做', kind: 'textarea', options: [], placeholder: '', required: true },
      { id: 'p5.second', label: '第二件事，以及为什么', kind: 'textarea', options: [], placeholder: '', required: true },
      { id: 'p5.measure', label: '怎么判断有效：看什么指标、多久以后、变成多少算有效', kind: 'textarea', options: [], placeholder: '例如：两周后看……，从 …% 降到 …% 以下', required: true }
    ] },
  { id: 'p6', title: '说清楚：还缺什么信息', when: 'practice', lessons: ['L4'], material: '',
    prompt: '要确认你的判断，还缺哪些信息？写出你会向谁要什么数据。',
    hints: ['现在的退货原因是整体统计，能不能按车型拆开？', '广告带来的订单和其他订单，退货率一样吗？', '退回来的实物检查过吗？'], framework: '', terms: [],
    fields: [{ id: 'p6.missing', label: '还缺哪些信息，向谁要', kind: 'textarea', options: [], placeholder: '', required: true }] },
  { id: 'p7', title: '迁移练习：换一个商品，再用一次方法', when: 'transfer', lessons: ['L1', 'L2', 'L3', 'L4'],
    material: '新情境（模拟数据）：你负责一款车载手机支架。第 3 周起换了一家更便宜的包装供应商。\n第 1 周：订单 400，退货 20\n第 2 周：订单 600，退货 31\n第 3 周：订单 800，退货 40\n第 4 周：订单 1,000，退货 52\n主管说：「换了新包装以后，退货多了一倍多，赶紧换回去。」',
    prompt: '用刚学的方法看看主管的判断：先算前 2 周和后 2 周的整体退货率，再判断「退货问题是不是变严重了」，最后写一个可验证的假设。',
    hints: ['退货单数从 51 变成了 92，但订单也变多了。', '先用合计数算两段的退货率，再比较。', '如果真是包装的问题，应该能在哪类退货原因里看到变化？'], framework: '', terms: ['退货率'],
    fields: [
      { id: 't.before', label: '第 1–2 周整体退货率', kind: 'text', options: [], placeholder: '', required: true, check: N(5.1, '(20 + 31) ÷ (400 + 600) = 51 ÷ 1,000 = 5.1%。') },
      { id: 't.after', label: '第 3–4 周整体退货率', kind: 'text', options: [], placeholder: '', required: true, check: N(5.1, '(40 + 52) ÷ (800 + 1,000) = 92 ÷ 1,800 ≈ 5.1%。') },
      { id: 't.judge', label: '你的判断', kind: 'choices', single: true, options: ['退货问题变严重了', '退货率基本没变，退货变多主要是因为订单变多了', '看不出来，数据还不够'], placeholder: '', required: true,
        check: { kind: 'choices' as const, expect: ['退货率基本没变，退货变多主要是因为订单变多了'], tol: 0, unit: '', alt: [], explain: '两段的整体退货率都是约 5.1%。退货单数多了八成，是因为订单多了八成。',
          why: { '退货问题变严重了': '只看了退货单数。按退货率算，两段几乎一样。', '看不出来，数据还不够': '要判断「包装有没有让问题变严重」，确实还缺退货原因的数据；但要回答「退货问题是不是变严重了」，现有数据已经能算出退货率没变。' } } },
      { id: 't.hypo', label: '如果你想继续查「新包装有没有问题」，写一个可验证的假设', kind: 'textarea', options: [], placeholder: '如果新包装有问题，那么应该看到……；如果看到……，说明不是包装的问题。', required: true }
    ] }
];

export const deepOutput = {
  title: '问题诊断与行动建议卡',
  sections: [
    { heading: '问题概述', fields: ['p1.before', 'p1.after', 'p1.other', 'p2.when'], hint: '' },
    { heading: '关键证据', fields: ['p3.main'], hint: '' },
    { heading: '原因假设', fields: ['p4.causes', 'p4.why', 'p4.hif', 'p4.hsee', 'p4.hnot'], hint: '' },
    { heading: '优先行动', fields: ['p5.first', 'p5.second', 'p5.measure'], hint: '' },
    { heading: '待验证信息', fields: ['p6.missing'], hint: '' },
    { heading: '迁移练习：车载手机支架', fields: ['t.before', 't.after', 't.judge', 't.hypo'], hint: '' }
  ]
};

export const deepProvenance = [
  { kind: 'sim' as const, title: '示范（手机壳）、正式任务（刹车片）、热身题和迁移练习的店铺与数据', detail: '完全模拟的教学数据，三组材料互不相同，数字可以验算，不对应任何真实店铺。', source: '', url: '', date: '' },
  { kind: 'adapted' as const, title: '「适配信息（Fitment）」的说明', detail: '根据 eBay 卖家中心公开页面改编为中文并简化。', source: 'eBay Seller Center：Amp up your listing quality with fitment', url: 'https://www.ebay.com/sellercenter/listings/list-with-fitment', date: '2026-11-11 查阅' },
  { kind: 'adapted' as const, title: '「广泛匹配」的说明', detail: '根据 Amazon Ads 公开指南改编为中文并简化。', source: 'Amazon Ads：A guide to targeting with Sponsored Products', url: 'https://advertising.amazon.com/library/guides/targeting-with-sponsored-products', date: '2026-11-11 查阅' }
];
