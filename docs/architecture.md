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
        ├── /api/reviews       保存与读取复盘
        ├── /api/memories      长期记忆 CRUD 与抽取
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
| `settings` | 全局设置 | 默认文风、栏目开关、固定话术、长期记忆 |
| `memories` | 长期记忆 | `scope`、`student_id`、`category`、`content`、`importance`、`status` |
| `usage_events` | 使用埋点 | `event`、`review_date`、`properties`（只存数量/枚举/耗时） |

`reviews.draft` 是整个生成链路的核心数据，结构为：

```ts
{
  sections: Record<SectionKey, string[]>,
  dailyPhrase?: string,
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
- `final` 模式空正文抛错，漏栏目用当前草稿补回；
- 固定话术开关关闭时，不生成 `dailyPhrase`。

## Prompt 组织

`lib/ai/prompt.ts` 负责拼装 system prompt 和 user prompt。system prompt 按模式组装：

| 模式 | 内容 |
| --- | --- |
| `questions` | 栏目说明、追问规则、好问题示例 |
| `final` | 栏目规则、最终稿规则、固定话术规则、文风示例 |
| `restyle` | 改文风规则、文风对比示例 |

每次请求只带必要上下文：

- 今天日期、学生名单；
- 长期记忆（通用 + 今天提到的学生）；
- 最近两天复盘（仅最终稿）；
- 流水账、历史问答、当前草稿。

追问阶段不生成正文，是为了避免半成品预览，也避免为最终会被替换的内容付费。

## 可靠性设计

1. **JSON 提取**：模型偶尔输出 Markdown 代码块或前后解释，`extractJson` 会截取第一个 `{` 到最后一个 `}`。
2. **Zod 校验**：字段类型、长度、问题数量都在 `lib/schema.ts` 约束。
3. **一次纠错重试**：格式错误时把错误信息回传模型，温度降到 0.1。
4. **兜底草稿**：没有 Key 或模型持续失败时，按标点拆分原文生成草稿，页面不崩。
5. **数据保护**：空正文、漏栏目、改文风条目数变化都不会静默覆盖用户内容。

## 长期记忆

```text
最终复盘
   │
   ▼
extractMemories（独立 prompt）
   │  返回 id / scope / studentName / category / content / importance
   ▼
resolveMemoryStudent（按 id 或姓名匹配学生）
   │
   ▼
完全重复 → 跳过
相似度 ≥ 0.42 → 更新同一条
否则 → 新增
```

相似度使用字符二元组 Dice 系数，只用于同学生、同分类的候选记忆。它不能替代语义检索，但足够处理「已报名 / 已经交费」这类措辞变化。

生成时 `selectMemoriesForPrompt` 只带：

- 所有通用记忆；
- 今天流水账/问答里提到的学生的记忆；
- 按重要度和更新时间排序，限制 40 条。

## 埋点

`usage_events` 是分析表，不是业务表。设计原则：

- 只记录事件名、数量、枚举、耗时；
- 不记录复盘原文、学生姓名、问题文本；
- 写入失败只告警，不影响生成或保存；
- 客户端只能上报 `review_copied` 和 `question_answered`，服务端有白名单校验。

统计脚本 `scripts/stats.ts` 读取事件表，输出成功率、P50/P95、token、追问回答率、复制率、编辑改动、记忆命中率。

## 关键取舍

**为什么不用 LangChain / LangGraph**
当前流程是固定的三段状态机，追问轮次和输出结构都由代码控制。引入编排框架不会减少复杂度，反而增加依赖和调试成本。等需要模型自主选工具、动态规划步骤时再引入。

**为什么用 PGlite + Supabase 双环境**
本地开发不需要安装数据库，`npm install` 后即可跑；生产用 Supabase，数据不会因为 Vercel 无状态部署丢失。两套环境共用 Drizzle schema 和迁移。

**为什么用 JSON mode 而不是 function calling**
当前输出是固定结构的复盘正文，`response_format: json_object` + Zod 已经足够。function calling 更适合模型需要选择工具、查询外部数据的场景，已列入 Roadmap。

**为什么埋点不存内容**
复盘里包含学生姓名和家长沟通细节。分析只需要数量和比率，存原文会让分析表变成第二份隐私副本。

## 已知限制

- 记忆检索是字符串匹配，不是语义检索；
- 生成是整段返回，没有流式输出；
- 单个实例的登录限流是内存 Map，Serverless 多实例下不严格；
- 评测集只有 30 条，规则检查覆盖结构，不能完全替代人工评审；
- 改文风依赖模型严格保持条目数，失败时会保留原稿并提示重试。
