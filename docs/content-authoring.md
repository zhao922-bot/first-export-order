# JSON 内容编辑说明

当前运行包是 `src/content/levels/L01-L07.json`，在 `src/content/manifest.json` 注册，模式为 `slice`、版本 `0.9.0-slice`。包含 161 个闭合节点（137 个原主线节点 + 22 个事件选择/复盘节点 + 2 个报价丢单节点；e11 复用主线审证两节点）。原主线第 2 关 16 个、第 4 关 25 个、第 5 关 21 个、第 6 关 20 个、第 7 关 23 个。第 6 关新增可继续/退出选择；第 7 关比原 22 节点预算多一处 EXW 装船来源复盘。原脚手架包已移至测试夹具。

1. 保持 manifest 的版本、mode、包路径与数据一致。内容目录中的所有 JSON 都必须登记。
2. 修改文案、选项、effects、results、参数或题目字段后，运行 `pnpm content:validate`。
3. `pnpm content:schema` 更新编辑器 JSON Schema。结构来自 domain/schemas，语义与跨引用以 CLI 为准。
4. 构建和浏览器加载使用同一验证器。输出带文件名与 JSON Pointer。
5. 更改剧情兼容性时同步增加 contentVersion；不兼容的本地切片进度会要求重新开始。

parameters 中的金额、税率、费率、汇率带 Parameter 元数据：unit、teachingOnly、note「教学算例参数，可配置」、reviewStatus。collection 配置的费用统一为人民币分（Fen），天数为整数，汇率因子和比例为十进制字符串；受严格 schema 和上下界约束，沿用全局教学参数说明。当前为教学草案。

## 七关运行约束

sliceProfile 限制 stage 只能是 1–7，节点类型仅 choice/calc/review/settlement。效果支持产品/供应商/客户、已声明标记、信誉、准备天数、样品费用和 `customer.adjustActiveTrust`（整数增量、0–100 钳制）。`negotiation.offer/payment/terms/cancel`、`ledger.preparationExpense` 和 `contract.sign` 仅允许出现在第 4 关；`procurement.*` 仅第 5 关；已实现的 `logistics.*` 仅第 6 关；`collection.*` 仅第 7 关。执行 all/any/not、eq/ne/gt/gte/lt/lte、exists、in（右侧为标量表达式数组）及已声明 flag 条件，条件不抽数；效果仍使用常量。未实现规则在构建阶段被拒绝。

选择后的 feedback 先展示，点击继续才进入 nextNodeId；review 的正文及后续节点都来自 JSON。导师正文不得超过 120 字。分步题通过 puzzle.inputFields 只校核当步，最后必须回到全字段复核。

普通 UI 标签与公式标题在组件中；剧情、导师讲话、选项后果与转移在 JSON 中。文案可用 `{{sampleFee}}` 插入已登记标量，或用 `{{openingB|percent}}` 格式化百分比。未知参数和格式会被校验拒绝；不会执行表达式或 HTML。

## 询盘与客户

五个 customer 分别对应 precise/bargainer/novice/fraud/potential，保留项目约定的 `customer_a`–`customer_e` 标识。每人一份 inquiry，另有一份不绑定客户的 competitor 模板。发送者角色、信号标签和档案用于校验与复盘，不在玩家首次分类前显示答案。

`replyNodeId` 指向所属角色的分类节点，节点用 `inquiry_buyer`、`inquiry_competitor`、`inquiry_fraud` 标签关联来信。三条链都是分类 → 后果 → 林姐分析 → 两种回复 → 后果 → 林姐复盘。D 再经过撤回/保留风险选择。

`buyerDone`/`competitorDone`/`fraudDone` 控制收件箱与报价入口；已完成邮件可重读、不可重复作答刷信誉。`inquiryBuyerId` 确定本局真实买家，报价对象从本局买家和仍保留的 D 候选中选择。`buyerPricingLeaked`、`competitorPricingLeaked` 记录信息泄露；`fraudPending`、`fraudPaymentPromised`、`customerIsFraud` 仅保留后续风险，本关不产生对应付款或第 4 关事件。

`firstBuyerId` 默认 C；应用只对首次完整流程传入 firstInquiryRun，独立报价不占该标记。重开按 JSON 中非 fraud 客户抽取。收件箱顺序、实际买家、初始信任和随机状态均一次生成后保存；条件判断与刷新不消耗随机数。

## 参数与随机

quote_ 前缀定义黄金算例输入。variant1/2/3 定义三组数量比例、汇率、海运费和港口；产品与供应商定义成本、税率、MOQ。数量抽样时受 MOQ 与准备资金约束，资格取决于凭证，不由随机数决定。

根 seed 派生 parameters/events/documents 三个独立状态。参数流保持 v1 FNV-1a + xoshiro128**；事件流 v2 在 FNV-1a 四个种子字后增加 avalanche 混合，避免相邻种子字使最初抽数相关，rngVersion 为 2。参数、客户和现有询盘种子保持原结果。备货与运输不再独立消耗事件流；已知的样品/凭证异常来自供应商资料，新增偶发异常经统一窗口产生。

窗口、抽取结果、次数、随机状态、待处理事件和反馈一并保存。条件判断、方案比较、页面构建与读档不抽数。内容版本变更后旧局要求重开，不提供跨版本推测迁移。

previewBalanceDay/previewCollectionDay/previewRebateDay 控制报价后的教学资金预览。第 3–4 关的预览不推进时间或生成真实付款。第 5 关按已签合同金额、约定定金比例、供应商付款比例与配置银行费生成实际教学流水，不重复入账签约前的预测。

## 第 4 关谈判与签约

`negotiation.profiles` 覆盖五位客户的三轮文案与开口折扣；`offers` 引用数量比例、折扣及定金比例参数。`payments`、`terms` 分别包含三种付款方式、三个贸易术语，`checklist` 声明六项签约确认。规则参数、唯一性、客户覆盖、命名地点、期限与数值范围均在构建时校验。

报价交接可进入第 4 关或结束独立练习。三轮按价格/数量 → 付款保障 → 术语/地点推进，每轮先后果、再林姐复盘。重新议价会清空后两轮与合同勾选，保留实际已花费用；同一谈判节点不重复奖励信任。

L/C 路线必须处理买方控制的验收文件。改单费与等待天数由 JSON 指定；接受软条款保留风险。D 的认证费作为真实损失入账，可拒付或付费后止损。费用不足时原子回滚，不能产生负现金或已支付标记。

签约记录数量、单价、总额、付款、术语/地点和交付期限，不推进采购或确认收入。OA 收款预估从计划交付日另加账期；真实应收到期日保持空值，待后续实际交付建立。T/T、L/C 和 OA 的资金表均为假设预览，不写账本；D 的付款承诺不列作预计流入。

## 第 5 关 PI、资金与验货

`procurement.piFields` 必须唯一且完整地覆盖 parties/product/quantity/amount/terms/payment/delivery 七项。PI 从已签合同生成；本页只核对与记录接受，不另签一次或重设交期。`fundingChecks` 四项必须覆盖 source/parties/conditions/risk，`fundingEvidence` 提供 T/T、L/C、OA、异常账户的模拟凭据，`fundingMessages` 提供五种核验结果文案。

`procurement.inspectionProfiles` 覆盖三产品，每份必须有 material/quantity/specification/packaging/documents 五项及 good/bad 证据。UI 逐项阅读后才能作答；错误答案先后果、再林姐复盘。返工与补检分别修复质量和凭证问题，每次生成新的 inspectionRevision 并清空阅读及判断记录。资料补齐不自动改变退税资格，也不确认退税应收。

配置引用基础生产天数、延期天数、返工/补检费用及天数、信用证有效天数/修改天数、生产前后退款比例。天数限制在 1–365，费用限制在 0–1,000,000，退款比例限制在 0–1。生产耗时取基础天数与供应商 leadDays 的较大值，供应商延期事件已增加的时间不再次计入生产。所有变更继续消耗原签约交期。

规则为 `procurement.acceptPi/verifyFunding/repairLc/payDeposit/produce/inspect/resolve/acceptInspection/payBalance/cancel`；resolve 的 resolution 只接受 rework/supplement。第 5 关每个事务最多一条业务规则，禁止夹带其他关卡记账规则。状态还会核对前置条件与是否已执行，不能靠修改 JSON 的 enabled 条件绕过财务门槛。

T/T 核验实际流水后借现金、贷客户预收款，银行费用单独入账；L/C 必须核对有效期与软条款，OA 无定金。客户 D 的不匹配账户会核验失败。供应商定金记采购预付款；验收和尾款完成才转库存，订单为 ready，尚未对客交付。终止协议按生产阶段退款，供应商未退部分为损失；客户退款不能超过现金，未退清部分仍为负债。费用不足或重复命令不得留下半笔账。

第 4 关签约记录可以结束练习或进入第 5 关。完整流程带产品与供应商才开放备货；独立报价练习仍可到第 4 关。第 5 关验收入库后可继续第 6 关；停止采购的分支不进入物流。

## 第 6 关物流与出运

`forwarders` 定义三家货代的基准柜价、相对进入本关的截关/船期及航程；portId 为基准报价港口。`logistics.plans` 一对一引用货代，配置出口服务倍率、附加费、买方提货天数、查验/甩柜概率。实际柜价乘本局海运参数与基准 quote_oceanTotalUsd 的比值，适配已选航线或自定义报价；不重算已签合同价。

箱数向上取整，总体积为箱数乘箱体积，总毛重为产品总重加箱皮重。F05 取体积、重量约束所需柜数的较大值。CIF 付主运费及保险；FOB 只付本方出口服务；EXW 只付原约定工厂准备费。买方费用仅展示。保险按已签发票额 × 至少 110% × 费率计算一次，扩展方案只加配置费率。

`declarationFields` 完整覆盖 product/quantity/amount/term/origin/destination。草稿包含一个可修正数量差异，六项确认后才校核；修改自动清除该项确认。`responsibilities`、`riskCopy`、`insuranceCopy` 与全部节点文案来自 JSON。不得创建真实报关文件或擅自扩充第 7 关模板。

规则为 `logistics.plan/insurance/declaration/book/dispatch/resolve/deliver/hold`。第 5、6 关每个事务最多一条所属业务规则，不允许混入其他效果。订舱先扣本方费用；dispatch 推进准备，进入承运反馈窗口后才由统一调度取得偶发事件。查验 standard/expedite 分别配置费用与至少一天的处理时间；超过截关按 nextSailingDays 顺延。甩柜 wait/priority 分别增加等待、堆存或改配费用，FOB 主运输价差归买方。复用原交期，F13/F14 按新增逾期天数记费用与信誉。

deliver 必须已核对数据、保险和风险处置。EXW 确认约定工厂交付、状态 delivered；FOB/CIF 确认装船、状态 shipped。F11 记收入及库存成本，客户预收款抵应收款，不产生新现金。OA 仅已装船时建立实际到期日；EXW 等待买方装船证据。完整退税条件尚未核验，本关不确认税款应收或收税款。

hold 是本次练习暂停，保留库存、预收款、已付费用和合同责任，不等于取消合同或同意延期。内容版本变更后旧进度不直接加载；不提供跨版本自动迁移。

## 扩展边界

每个 pack 是独立闭合校验单元，节点 id 全局唯一。本次没有把后续关卡内容放入运行包。未来拆成多包/资源装配、扩充效果 DSL 或新增玩法，需要显式扩展验证与执行器；不能直接把完整 game 模式数据塞给切片执行器。

第 7 关采用 collection 配置与 documentTemplates / puzzles：PI 是只读源记录，其他四份模板可标错、填写修改值。faults 引用模板字段与 confirmedOrder 源路径；普通题至少三份单据、三处独立差异，L/C 额外包含信用证收货人差异，必须改正全部错误。只支持已声明字段的 exact / number 比较，不执行任意表达式。

collection 配置管理付款等待、交单期限、改单/银行费用、结算汇率因子、OA 部分比例和退库等待。比例、字段唯一性、错误引用、模板种类、L/C 差异及跨阶段规则均在内容验证时检查。每个收汇事务最多一项业务规则；运行时另有节点、方法、单据与款项状态门槛。

当前四处普通差异固定且可配置，不声称实现随机错误抽样。不同订单仍从已确认合同/交付动态生成数量、金额、毛重、箱数、客户与装船日。剧情后果/林姐复盘来自 JSON；税务核验为已声明的教学模型，draft 不代表行业审校通过。

## 结局、评分证据与知识图鉴（0.7）

debrief.scoring 配置目标成本收益率、最小利润评分基数和优秀信誉门槛；与 collection 的优秀门槛必须一致。四条 endings 定义唯一 kind、标题和林姐式反馈。debrief.terminalNodeIds 只允许正式 settlement 节点，不能把练习退出或中途暂停加入正式结算。

rubrics 逐项登记 title、dimension、opportunityId、mandatory、maxPoints 和 evidenceNodeIds。paymentMethods 可将专属项限定在 TT、LC_SIGHT 或 OA_60 路线；未触发的事件项使用 mandatory:false。debrief.assessments 绑定 nodeIds、choiceIds、correctChoiceIds，以及可选的已声明布尔 successFlag。不执行任意路径或代码。报价使用 evaluator 的有限结果 id；其他选择在实际业务规则执行成功后取证。

reputationReward 设为 0–3；运行时还按该次实际证据分封顶。同机会之前已获得正分时不再奖励；返工、辅导最多一分。不要为同一业务机会创建不同 opportunityId 来绕过防刷。

debrief.replayGuides 的 familyId 是回放去重依据，riskChoiceIds 对应真实可用选项。alternative 只描述下次建议，不编造未发生方案的收入。决策记录保存当时财务、信誉、信任和游戏日，再以实际 deltas 显示前后变化。

glossary 必须有 24 张卡，包含定义、触发节点、本局示例、误区、前置关系、参考来源和审校状态。示例只允许 quantity、moq、supplier、product、price、vat、rebate、markup、fx、term、place、payment、invoice、freight、day、coverage、insuranceRate 占位。没有确定的订单字段明确显示尚未选择/尚未签约；数字附教学标签。

debrief.quizzes 与词条一一对应，题目、2–4 个选项、唯一有效答案和解释均由 JSON 提供。打开或触发词条只表示接触；正确回答迁移题才记掌握。前置关系只表达学习关系，校验器拒绝缺失引用和环。题目状态与 term_opened/term_mastered 事件保存在本局本地记录中。

当前卡片为教学草稿，公开资料链接用于进一步核对，不代表已通过顾问审核。纯算式与游戏模型卡片可无外部链接。修改内容需更新 contentVersion；0.6 缺少评分证据，不迁移为推测成绩。

## 十二事件与窗口（0.8）

events 完整覆盖 e01–e12。每条声明 stages、weight、when、forceWhen、oncePerRun、mutexGroup、priority、exclusiveWeightBonus、choiceNodeId、reviewNodeId、maxExtraDays。suppliers.riskEventIds 与 customers.exclusiveEventIds 只增加同一事件的权重，不创建额外事件；导师无随机专属事件。

eventScheduling 管理 windowProbability（当前 0.65）、perStageEventCap（1）、perRunEventCap（3）和 windows。一个关卡可有多个业务窗口，但每关实际最多一个。窗口包含 stage/nodeId/returnNodeId/eventIds：L03.handoff；L04.lc.soft 与 L04.terms；L05.production；L06.gate 与 L06.risk；L07.payment。无候选或触及上限时不抽数，仍保存空窗口。普通发生概率失败也保存状态；不能用刷新、返工重抽。首审证机会提前预留一次配额，L/C 不受普通概率影响。

调度顺序：窗口历史/活动事件/次数 → 前置条件/已触发/互斥/可负担选项 → 强制优先 → 发生概率 → 正权重抽取 → 保存 pendingEvent 与 RNG → 选择 → feedback → 林姐 review → 原 returnNodeId。返回不重放 onEnterEffects，也不重新抽窗口。e11 使用 useNodeEffects 复用现有改单费用、风险标记及评分，不再另做第二份审证。重复议价复用第一次审证结果，费用不重复。

eventEconomy 以 eventId 关联各 choiceId：费用参数、extraDays、trustDelta、reputationDelta、riskFlag、resultFlags、eventCostMode；operation 只接受已实现的 standard/fxRequote/fxRetain/freightIncrease/priceDiscount/logisticsResolution。rateParam 引用精确小数，minimumDepositRatioParam 用于 T/T 让价交换定金。金额放 parameters 的 economy.events.eXX.*；e11 保留原 lcAmendFee。禁止以“利润减少”名义伪造费用：价格让步改变签约金额，汇差在实际收款时确认。FOB 主运价差归买方，CIF 涨价只追加卖方海运；目的港补偿只按本教学协同约定，不泛化为全部 CIF 费用。

eventReviews 保存风险主题与复盘索引，实际展示选择、反馈与 review 节点正文。每个选择必须到该事件的 review，实际结算与回流记录由引擎控制。rubrics 中事件项 mandatory:false，触发后才进入评分分母，决策记录包含真实 before/deltas 和 familyId，结局回放可引用。

单元测试既有财务黄金值通过明确的零普通事件概率包隔离，强制审证仍运行；新增 eventPack 测试使用生产概率与权重。Playwright 的十二事件边界测试仅把真实前序命令取得的状态停在窗口前，随后以生产内容经 UI 抽签、刷新、处置、复盘；完整七关测试只固定 UUID，不注入资金、答案或成绩。

## 业务因果配置（0.10）

L03 calc 仅做内部校核：onEnterEffects 和 results.effects 均为空，结果不得直接通往结算或其他关卡。删除 quotePolicy、quote.prepare、quote.lose、quoteErrorCount、quotePrepared 及对应参数。不得用自动费用、信誉惩罚或提交次数制造丢单。

collection.oaScenarios：唯一 id、正整数 weight、firstDays/recoveryDays（0–365）、firstRatio/recoveryRatio（0–1）、firstEvidence/recoveryEvidence、lossEvidence。后续比例乘剩余本金，非原发票金额。未收齐必须有损失证据，已全额回收不得配置损失材料；已首笔收齐不得再配置回收。情境是教学数据，非行业概率。工作台按 oaFirstChecked/oaRecoveryAttempted 逐步揭示材料，collectionMoneyClosed 与 oaLossSupported 控制 JSON 选择。无入账不产生收款手续费，不能重复跟进刷现金。

供应商 qualityRisk 控制生产完成时的批次异常；credentials 单独控制已知凭证缺口。qualityRoll 在生产前为 null，之后持久化。业务抽样使用独立命名空间，不改变事件流。改变业务参数须提高 contentVersion 并重新生成 Schema；本轮沿用不迁移旧内容存档的约定。

pnpm balance:simulate --seeds=1000 --workers=4 默认写 outputs/balance-business，保留原 balance-final 的 0.9 历史证据。teachingObservations 报告原收益目标，gates 只检查当前安全约束；不再追求因内部错误造成的最低丢单率。
