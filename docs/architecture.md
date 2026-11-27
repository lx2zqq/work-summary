# 架构说明

## 总览

应用是一个单体的 Next.js 16 项目：页面、接口、模型调用和数据库访问都在同一个仓库里。这样做的原因是使用规模小、部署简单，不需要为一个人或几个人的使用量引入微服务。

```text
浏览器
  │
  ├── Server Components / Client Components
  │
  └── Route Handlers
        ├── /api/generate      追问与最终稿
        ├── /api/reviews       保存、读取与删除复盘
        ├── /api/export        数据备份（JSON / Markdown）
        ├── /api/memories      长期记忆 CRUD 与抽取
        ├── /api/weekly-reports 周报读取、生成、保存与 Excel 导出
        ├── /api/demo/weekly-export 演示周报导出（免登录）
        ├── /api/students      学生管理
        ├── /api/settings      设置
        ├── /api/transcribe    录音转写
        ├── /api/events        客户端埋点
        └── /api/auth          登录与退出
```

## 数据模型

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `students` | 学生名单 | `name`、`grade`、`subjects`、`status`、`note` |
| `reviews` | 每天的复盘 | `review_date`（唯一）、`raw_input`、`draft`、`final_text`、`conversation`、`round` |
| `settings` | 全局设置 | 默认文风、栏目开关、通用话术、长期记忆 |
| `memories` | 长期记忆 | `scope`、`student_id`、`category`、`content`、`importance`、`status`、`lifecycle`、`expires_at`、`archive_after`、`archive_reason` |
| `weekly_reports` | 每周周报 | `week_start`（唯一，周一）、`week_end`、`content`（JSONB）、`status`、`source_review_count`、`generated_at` |
| `usage_events` | 使用埋点 | `event`、`review_date`、`properties`（只存数量/枚举/耗时） |

`reviews.draft` 是整个生成链路的核心数据，结构为：

```ts
{
  sections: Record<SectionKey, string[]>,
  dailyPhrase?: string, // 旧版字段，仅用于兼容历史复盘
  questions: FollowUpQuestion[],
  notes: string[]
}
```

`conversation` 保存历史问答，`round` 记录当前追问轮次。手动重新生成会重置轮次，但保留问答记录。

## 生成状态机

```text
                    ┌──────────────┐
                    │  raw input   │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
              ┌─────│  questions   │◀────┐
              │     └──────┬───────┘     │
              │            │ 用户回答     │ 还有缺口
              │            ▼             │
              │     ┌──────────────┐     │
              │     │   round + 1  │─────┘
              │     └──────┬───────┘
              │            │ 回答完 / 跳过 / 3 轮
              ▼            ▼
       ┌──────────────┐  ┌──────────────┐
       │   restyle    │  │    final     │
       └──────┬───────┘  └──────┬───────┘
              │                 │
              └────────┬────────┘
                       ▼
              normalizeDraft + 保护逻辑
                       ▼
                 save / render / copy
```

`finalizeDraft` 的约束：

- `questions` 模式只替换问题，保留已有正文；
- `restyle` 模式条目数必须一致，否则抛错保留原稿；
- `final` 模式空正文抛错，漏栏目用当前草稿补回。

日常复盘追问可以单独跳过（详见「通用复盘话术」），不会跳过整轮追问；提交时用 `AI_SKIP_ANSWER` 标记，最终稿仍然生成 1 条 AI 优化建议。

## Prompt 组织

`lib/ai/prompt.ts` 负责拼装 system prompt 和 user prompt。system prompt 按模式组装：

| 模式 | 内容 |
| --- | --- |
| `questions` | 栏目说明、追问规则、好问题示例 |
| `final` | 栏目规则、最终稿规则、文风示例 |
| `restyle` | 改文风规则、文风对比示例 |

`final` 模式下 `richang` 只输出 1 条温和优化建议，推荐 30~70 字，至少 25 字，不写工作总结；`questions` 模式下日常复盘追问必须带 `section: "richang"`，其他追问不带。用户跳过日常复盘追问时，user prompt 会额外注入「用户已跳过日常工作复盘追问」，要求结合当天流水账提炼。

每次请求只带必要上下文：

- 今天日期；
- 流水账、历史问答、当前草稿；
- 工具模式关闭或降级时才带学生名单、长期记忆和最近两天复盘。

追问阶段不生成正文，是为了避免半成品预览，也避免为最终会被替换的内容付费。

## 工具调用

学生名单、长期记忆和历史复盘默认不预注入，由模型在生成过程中自行查询。

| 工具 | 用途 | 单次结果上限 |
| --- | --- | --- |
| `search_students` | 按姓名片段、状态、年级查学生 | 20 条 |
| `search_memories` | 按学生、关键词、范围查长期记忆 | 20 条 |
| `search_reviews` | 按关键词和日期查历史复盘正文 | 5 条，每条截断 1200 字 |

`lib/ai/agent.ts` 负责循环：

1. 最多调用 4 次模型，前 3 次允许 `tool_choice: auto`，最后一次强制 `none` 收尾；
2. 整体预算 30 秒，单次调用取「25 秒」和「剩余预算」的较小值；
3. 同一次生成内相同工具和参数复用缓存；
4. 工具异常转成 `{"error": "..."}` 回给模型，不让一次坏调用打断整次生成；
5. `deepseek-flash` 是思考模式模型，assistant 消息里的 `reasoning_content` 必须原样回传，否则下一轮直接 400。

追问阶段使用同一套工具循环，额外要求：流水账里出现学生姓名时必须先查该学生的记忆，再生成问题。

**降级**：第一次调用若返回 400 且提到 `tools`，自动退回原来的全量预注入路径，并在埋点里记 `degraded=true`。`REVIEW_TOOLS_MODE=off` 可以强制关闭工具模式。

## 生成方式

最终稿一次性返回完整 JSON。生成期间前端显示等待态并隐藏旧复盘，完成后整体替换预览，避免旧内容与新结果混在一起。

`deepseek-flash` 是思考模式，首字前有 2~4 秒推理时间，逐字流式在真实使用中几乎不可见，因此不提供流式输出。

## 可靠性设计

1. **JSON 提取**：模型偶尔输出 Markdown 代码块或前后解释，`extractJson` 会截取第一个 `{` 到最后一个 `}`。
2. **Zod 校验**：字段类型、长度、问题数量都在 `lib/schema.ts` 约束。
3. **一次纠错重试**：格式错误时把错误信息回传模型，温度降到 0.1。
4. **兜底草稿**：没有 Key 或模型持续失败时，按标点拆分原文生成草稿，页面不崩。
5. **数据保护**：空正文、漏栏目、改文风条目数变化都不会静默覆盖用户内容。
6. **记忆解析容错**：Markdown 围栏、裸数组、单条字段漂移都会先清洗；首次解析失败静默重试一次，两次都失败才记录截断预览并返回格式错误。
7. **周报解析容错**：输出先清掉 Markdown 围栏再按括号配对截取 JSON，兼容包装层和中文 key，缺字段补「无/暂无」；首次失败静默重试一次，年级人数始终覆盖为程序统计值。请求日志会记录 `finish_reason` 和 token 用量，输出被截断时能直接定位。

## 长期记忆

```text
最终复盘
   │
   ▼
extractMemories（独立 prompt）
   │  返回 id / scope / studentName / category / content / importance
   │      / lifecycle / ttlDays
   ▼
resolveMemoryStudent（按 id 或姓名匹配学生）
   │
   ▼
完全重复 → 跳过
相似度 ≥ 0.42 → 更新同一条
否则 → 新增
```

相似度使用字符二元组 Dice 系数，只用于同学生、同分类的候选记忆。它不能替代语义检索，但足够处理「已报名 / 已经交费」这类措辞变化。

提取时同步判断生命周期：学生特点、学习习惯、家长长期偏好、固定工作规范记为 `permanent`；本周待办、某次补课或临时安排记为 `ephemeral`，由 `ttlDays`（默认 7 天，最长 90 天）算出 `expires_at`。判断不确定时默认长期，避免误归档长期信息。

工具模式下由 `search_memories` 按需查询，只返回 `active` 且未过期的记忆。降级模式仍用 `selectMemoriesForPrompt` 预注入：

- 所有通用记忆；
- 今天流水账/问答里提到的学生的记忆；
- 按重要度和更新时间排序，限制 40 条。

## 记忆生命周期

`memories.status` 有三种状态，存量数据默认 `active`：

```text
active ──(阶段性记忆过期)──▶ pending_archive ──(宽限期结束)──▶ archived
   ▲                                │
   └──────── keep / restore ────────┘
```

- `lifecycle=permanent`：长期有效，`expires_at` 为空；
- `lifecycle=ephemeral`：阶段性有效，提取时按 `ttlDays`（默认 7 天，最长 90 天）计算 `expires_at`；
- 到期后 `syncMemoryLifecycle` 把记忆推进到 `pending_archive`，设置 `archive_after = now + 5 天`、`archive_reason = '已过建议时效'`；
- 宽限期结束仍未被保留，则软归档为 `archived`。

推进采用惰性方式：生成或提取读取记忆前、记忆页渲染前、`GET /api/memories/pending` 都会串行执行一次 `syncMemoryLifecycle`，不依赖定时任务。需要固定节奏时，可以配置 `CRON_SECRET` 后由外部在凌晨调用 `POST /api/cron/memories-lifecycle`；不配置不影响主流程。

只有 `active` 且未过期的记忆会进入 Prompt，`archived` 永远不会注入。用户可以：

- 保留：`keepMemory(id, "permanent")` 转为长期，或 `extend_7d` 顺延 7 天；
- 立即归档：`archiveMemory`；
- 恢复：`restoreMemory` 默认转回长期，避免恢复后立刻再次过期。

选择软归档而不是物理删除，是因为记忆里可能有家长偏好、学生特点等不可再生的信息；删除不可逆，5 天宽限期让用户有机会纠正误判。物理删除仍然只由用户在记忆页手动触发。

## 周报

周报把一周（或自定义 14 天以内）的日报汇总成一份可以直接提交的文档。数据流：

```text
选择周次 / 自定义汇总区间
        │
        ▼
GET /api/weekly-reports
  │ 串行：weekly_reports → reviews 日期 → 在读学员
  ▼
编辑 / AI 生成
        │
        ▼
POST /api/weekly-reports/generate
  │ 串行：区间内日报 → 活跃长期记忆 → 在读学员
  ▼
lib/ai/weekly.ts（归纳 + extractJson + Zod + 一次重试）
  │ 程序统计的 activeStudentsByGrade 强制覆盖模型结果
  ▼
upsert weekly_reports → PUT 保存 → Excel 导出
```

**周次计算**

- `getWeekRange(date)` 把任意日期归一到所在自然周，周一到周日，统一按 `Asia/Shanghai`。
- `getDefaultWeeklyReportRange()` 在周一时默认上一周，返回 `isMondayDefaultLastWeek: true`；周二到周日默认本周。
- `shiftWeek(weekStart, ±1)` 计算上一周/下一周，跨月跨年沿用同一套字符串日期运算。

**数据组装**

- `GET /api/weekly-reports` 支持可选 `weekStart` 和自定义 `sourceStartDate` / `sourceEndDate`；未传时使用默认周次和整周。
- 严格串行查询：周报记录 → 区间内日报日期 → 在读学员，返回 `report`、`sourceReviews`、`computedActiveStudentsByGrade`。
- `POST /api/weekly-reports/generate` 严格串行查询日报正文、当前活跃的长期记忆和在读学员；区间内没有日报时返回 400，不调用模型。
- 自定义区间必须同时传开始和结束，开始不晚于结束，最长 14 天；不传时默认 `[weekStart, weekEnd]`。

**AI 汇总**

- `lib/ai/weekly.ts` 输入日报的最终稿、栏目草稿、原始流水账、活跃记忆和程序统计的年级人数。
- Prompt 明确禁止编造：日报没提到的请假/预警/停课/结课/扩科/新签/续费统一填「无」，没有求助填「暂无」，年级人数原样采用程序统计。
- `summary.miantan` 和 `summary.weixin` 分渠道归纳；`reflection` 要求 2~4 条有具体落脚点的心得；`nextWeek.zhongdianHuifang` 结合未闭环问题和长期记忆。
- 解析先用宽松 JSON 截取（兼容代码围栏、包装层、中文 key 和二次序列化），再过 `weeklyReportContentSchema`；缺字段补默认值，首次失败静默重试一次，重试提示会带上完整输出 schema。两次失败返回 502。

**保存与导出**

- `PUT /api/weekly-reports/[weekStart]` 保存手工编辑内容，`week_start` 归一为周一；已有记录保留 `source_review_count` 和 `generated_at`。
- `weekly_reports.status` 保留用于兼容历史数据和 API；当前界面只区分「未生成 / 有改动 / 已保存」，不再要求手动定稿，导出前有未保存修改会先自动保存。
- `GET /api/weekly-reports/[weekStart]/export` 读取已保存周报，用 `exceljs` 填充 `templates/weekly-report-template.xlsx`，返回 `.xlsx` 二进制流。
- 模板导出保留宋体、边框和原有合并单元格；写入 C3（面谈/微信）、C17-C24（数据汇总）、C31（心得）、C32-C33（下周安排）、C34（需要的支持）。
- 安全补充合并 `C17:N17` 到 `C23:N23`，跳过已存在的相交区域；清空模板里 J20 的孤立冒号；对写入单元格开启 `wrapText`，按内容行数估算并调高行高。
- `next.config.ts` 把 `exceljs` 放进 `serverExternalPackages`，避免打包器改写 Node 文件系统调用。
- 下载响应使用 `Content-Disposition: attachment; filename="..."; filename*=UTF-8''...`，前端 `fetch → blob → a[download]` 使用同源请求和本地 blob，不依赖外部资源。

**演示**

- `/demo/weekly` 使用 `WeeklyReportWorkspace mode="demo"`，样例包含上一周、本周两份已保存样例和模拟 AI 生成结果，数据来自 `lib/demo-data.ts` 的内存状态。
- 演示的 AI 生成只做短暂 loading 后填充样例，不调用模型；导出仍调用真实 `POST /api/demo/weekly-export`，所以下载的是套用模板的真实 `.xlsx`。
- demo 导出接口免登录，但接入限流并用 `weeklyReportContentSchema` + 自然周校验，字段长度受限，不读写数据库。

## 通用复盘话术

【日常工作复盘】在 `showFixedPhrase` 开启时固定输出 4 条：1 条 AI 根据当天流水账生成的温和优化建议，加 3 条模板话术。

- AI 优化建议恰好 1 条，推荐 30~70 字，至少 25 字（`RICHANG_MIN_CHARS`）；它基于当天具体场景，不写工作总结；
- 模板话术存在 `lib/daily-phrase.ts`，按 `general` / `exam` / `meeting` / `mistake` 分组，每条 45~60 字；模板长度不要求和 AI 建议完全一致；
- `lib/template.ts` 的 `renderReview` 在渲染时调用 `resolveGeneralPhrases`：用 `pickDailyPhrases(dateISO, draft, GENERAL_PHRASE_COUNT + 2, customPhrases)` 多取 2 条候选，过滤短于 `MIN_DAILY_PHRASE_LENGTH`（20 字）或与已有 AI 条目重复的话术，最终补足 3 条；
- 先按当天草稿判断主题，命中考试、会议、错题时第一条从对应主题池取，其余从 `general` 池补足；
- 用日期做索引确定起点，同一天刷新结果不变，连续两天组合不同；
- 话术只在渲染时追加，不写进 `sections`，也不计入 `itemCount`；
- 开关关闭时只保留 AI 生成的 1 条。

日常复盘追问可以单独跳过：`FollowUpQuestion.section === "richang"` 时前端显示「跳过，由 AI 提炼」，答案写入 `AI_SKIP_ANSWER`；`lib/answers.ts` 的 `parseStoredAnswer` 会还原为 `aiSkip`，生成失败重试时不会把标记当成用户手写内容。

### 自定义话术

设置页提供入口：用户贴一句自己觉得好的话术，系统润色成 45~65 字，检查通过后给预览，确认才入库。

- 存在 `settings.custom_phrases`（JSONB），和内置 49 条一起参与轮换；
- 最多 50 条，避免稀释内置库风格；
- 主题先用正则判断原话（`detectThemeFromText`），命中错题/考试/会议时，改写结果必须围绕该主题，不交给模型自由发挥；
- 重复判断用字符二元组 Dice 相似度，≥ 0.7 视为和已有话术重复；
- 润色请求带 `reasoning_effort: low`：默认思考强度会打满 token 上限，正文被挤成空字符串，单次请求超过 25 秒。

## 埋点

`usage_events` 是分析表，不是业务表。设计原则：

- 只记录事件名、数量、枚举、耗时；
- 不记录复盘原文、学生姓名、问题文本；
- 写入失败只告警，不影响生成或保存；
- 客户端只能上报 `review_copied` 和 `question_answered`，服务端有白名单校验。

统计脚本 `scripts/stats.ts` 读取事件表，输出成功率、P50/P95、token、追问回答率、复制率、编辑改动、记忆注入率。生成事件还记录工具调用次数、模型轮数、是否降级和实际查到的记忆条数，用于观察工具模式的真实使用情况。

## 关键取舍

**为什么不用 LangChain / LangGraph**
当前流程是固定的三段状态机，追问轮次和输出结构都由代码控制。工具循环是 4 轮上限的简单 `while`，不需要引入编排框架；等出现多 Agent 协作或复杂分支规划时再考虑。

**为什么用 PGlite + Supabase 双环境**
本地开发不需要安装数据库，`npm install` 后即可跑；生产用 Supabase，数据独立于应用进程，重启或重新部署不会丢失。两套环境共用 Drizzle schema 和迁移。

**为什么 JSON mode 和工具调用同时用**
两者可以共存：带 `tools` 的请求仍然传 `response_format: json_object`，前提是 prompt 里出现 "json" 字样（现在是「只输出 JSON」）。工具轮次和最终输出共用同一套 JSON 解析和 Zod 校验，不需要两套代码。

**为什么工具化之后还保留预注入**
它是降级路径。模型或兼容层不支持 `tools` 时，400 会被识别并自动退回全量预注入，线上不会因为换模型中断。代价是两套上下文组装逻辑要同时维护，prompt 改动必须同时验证两种模式。

**为什么通用话术用固定库而不是 AI 生成**
通用话术需要稳定、可预期、零成本，也不能出现编造的学生或金额。AI 只负责结合当天流水账写 1 条温和优化建议，其余 3 条从人工整理的样例库轮换，既保持样例风格，又避免每天风格漂移。

模板话术长度控制在 45~60 字；AI 优化建议推荐 30~70 字，至少 25 字，不强行对齐模板长度。扩写时只增加具体动作和可验证结果，不堆形容词——否则字数是够了，但读起来更像套话。

**为什么周报用 Excel 模板而不是代码画表**
周报要直接交给主管，格式固定且需要保留宋体和合并单元格。用代码逐格画表很难和线下模板完全一致，所以把模板放仓库，`exceljs` 只负责填值、补合并和行高；模板调整不需要改代码，代价是单元格坐标和列结构耦合，模板改动时必须同步 `lib/weekly-export.ts`。

**为什么埋点不存内容**
复盘里包含学生姓名和家长沟通细节。分析只需要数量和比率，存原文会让分析表变成第二份隐私副本。

## 已知限制

- 记忆检索是字符串匹配，不是语义检索；
- 工具模式下模型可能不调用工具，背景数据不保证一定被使用，只能靠 prompt 约束和评测兜底；
- 多轮工具调用会拉长延迟和累计 token，简单流水账也可能付出一次额外往返；
- 单个实例的登录限流是内存 Map，Serverless 多实例下不严格；
- 评测集只有 30 条，规则检查覆盖结构，不能完全替代人工评审；
- 改文风依赖模型严格保持条目数，失败时会保留原稿并提示重试；
- 记忆生命周期靠惰性流转，长时间不访问时状态不会提前变化；需要固定节奏时用可选的定时接口；
- 周报导出依赖仓库内的 Excel 模板，模板缺失或列结构变化会导致导出失败；单元格映射目前固定在 C3、C17-C24、C31-C34；
- 周报一次最多汇总 14 天日报，超长日报会按块截断；生成不流式，长周报需要等待完整返回。
