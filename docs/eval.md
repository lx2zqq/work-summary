# 评测说明

评测分两类：

1. **离线检查**：数据集自检、Prompt 组装、模板渲染，不调用模型，可进 CI；
2. **真实模型评测**：调用 DeepSeek 生成结果，再用规则检查评分，可选 LLM judge。

另外，`npm run stats` 读取真实使用埋点，和离线评测互补：评测看质量下限，埋点看真实使用情况。

## 数据集

`eval/cases.ts` 目前有 30 条用例：

| 分类 | 数量 | 覆盖内容 |
| --- | --- | --- |
| 短流水账 | 5 | 单学生、单事项、空内容、业绩 |
| 中等流水账 | 5 | 多栏目、多学生、家长沟通、金额 |
| 长流水账 | 5 | 多事项、多学生、教研、困难 |
| 边界异常 | 5 | 空输入、超长输入、数字、否定回答 |
| 长期记忆 | 5 | 相关记忆、无关记忆、冲突状态、追问 |
| 改文风 | 5 | 简洁→详细、详细→简洁、空栏目、日常工作复盘 |

每条用例包含：

```ts
{
  id: "short-001",
  tags: ["short", "final", "core-sections"],
  mode: "final" | "questions" | "restyle",
  rawInput: "...",
  style: "concise" | "detailed",
  studentNames: ["林小满"],
  answers: [],
  memories: [],
  currentDraft?: ReviewDraft,
  settings?: Partial<AppSettings>,
  promptIncludes?: string[],
  expect: { ... }
}
```

`validateCase` 会检查期望值是否自洽：`mustInclude` 必须能在输入里找到，`forbidStudents` 不能出现在输入里。避免用错误标准评判模型。

## 规则检查

`lib/eval/checks.ts` 实现以下检查：

| 检查 | 内容 |
| --- | --- |
| 结构 | 栏目都是数组、无空条目、问题数 ≤3、notes ≤3 |
| 日常工作复盘 | 最终稿恰好 1 条，且不少于 35 字 |
| 必含事实 | `mustInclude` 中的学生名、数字、关键词必须出现 |
| 禁止内容 | `mustNotInclude` 不得出现，包括旧状态和占位词 |
| 名单外学生 | `forbidStudents` 不得出现在正文 |
| 栏目覆盖 | 每个栏目有最小/最大条目数 |
| 追问质量 | 问题数量、选项数量、必须提到指定关键词 |
| 工具调用 | 用例要求的工具必须被调用；提到学生却没查记忆会失败 |
| 占位词 | 不出现「待确认」「待补充」「未提供」 |
| 改文风 | 条目数不变、详细版更长 |

空输入用例可以设置 `allowEmpty: true`。模型返回空正文时会被 `finalizeDraft` 拦下，这属于保护逻辑，按通过处理并记录「空输入保护」。

## 运行方式

```bash
npm run eval
```

离线检查，不需要 API Key。检查：

- 30 条用例自检；
- Prompt 是否包含流水账和模式说明；工具模式下学生和记忆允许不在 prompt 里，但必须能通过工具查到；
- 模板渲染、栏目标题、空栏目、通用话术、去重。

```bash
npm run eval:ai
```

真实模型评测。需要 `REVIEW_DEEPSEEK_API_KEY`。默认并发 2，避免触发限流。

```bash
npm run eval:ai -- --tags=short --limit=5
npm run eval:ai -- --judge --judge-limit=5
npm run eval:ai -- --baseline=eval/baseline.json
npm run eval:ai -- --strict
```

| 参数 | 作用 |
| --- | --- |
| `--tags=short,memory` | 只跑指定标签 |
| `--limit=5` | 限制用例数 |
| `--judge` | 对前 N 条最终稿调用 LLM judge |
| `--judge-limit=5` | judge 数量，默认 10 |
| `--baseline=path` | 和基线报告对比通过率 |
| `--strict` | 有质量问题也返回非零退出码 |
| `--out=eval` | 报告输出目录 |

## 指标定义

| 指标 | 定义 |
| --- | --- |
| 通过率 | 通过用例 / 总用例 |
| 平均耗时 / P95 | 单次生成接口耗时 |
| prompt / completion tokens | 模型返回的 usage，重试时累加 |
| 追问回答率 | 非跳过提交 / 全部追问提交 |
| 复制率 | 有复制事件的天数 / 有最终稿的天数 |
| 平均条目改动数 | 同一天最终稿与保存稿的条目数差绝对值均值 |
| 记忆注入率 | 生成前服务端准备了记忆的请求 / 全部生成请求（工具模式下不代表模型真的查过） |
| 工具记忆命中率 | 模型实际查到记忆的生成 / 全部成功生成，只有工具模式的数据才有 |
| 平均工具调用次数 | 每次生成调用工具的平均次数 |
| 工具调用覆盖率 | 至少调用过一次工具的用例 / 全部用例 |
| 降级次数 | 因模型不支持工具而退回预注入的次数 |

## 最近结果

2026-11-18，`deepseek-flash`，30 条用例，无 judge，工具模式：

| 指标 | 结果 |
| --- | --- |
| 通过 / 失败 / 错误 | 30 / 0 / 0 |
| 通过率 | 100% |
| 平均耗时 | 3,653 ms |
| P95 耗时 | 7,006 ms |
| 平均 prompt tokens | 3,566 |
| 平均 completion tokens | 534 |
| 平均工具调用次数 | 1.53 |
| 发生过工具调用的用例 | 50% |
| 降级次数 | 0 |

这些数字只代表当前数据集和模型版本。改 Prompt、换模型、加用例后应重跑，不要直接复用。

工具模式下 prompt tokens 是同一用例多轮请求的累计值，不能用它和单次预注入的数字直接比较。

## LLM judge

`--judge` 会对前 N 条非追问用例额外调用一次模型，按三个维度打分：

- `factuality` 事实一致性：是否编造学生、金额、渠道或结果；
- `completeness` 完整性：核心信息是否归类、空栏目是否硬凑；
- `usability` 可发送性：是否可以直接粘贴到钉钉。

judge 结果只作辅助，不替代规则检查和人工抽检。judge 调用会增加 token 成本，默认最多 10 条。

## 基线与回归

建议每次改 `lib/ai/prompt.ts` 后：

1. 递增 `PROMPT_VERSION`；
2. 跑全量 `npm run eval:ai -- --out=eval`；
3. 把 `eval/report.json` 复制为 `eval/baseline.json`；
4. 下次改动后用 `--baseline=eval/baseline.json` 对比通过率。

`eval/report.md` 和 `eval/report.json` 已加入 `.gitignore`，基线文件按需提交。

## 已知限制

- 规则检查能发现结构和事实问题，不能判断文字是否自然；
- 30 条用例覆盖常见场景，不覆盖所有学生表达；
- judge 有模型偏差，同一个结果多次打分可能不同；
- 评测使用虚拟姓名，和真实数据的分布仍有差距；
- 真实使用指标需要积累一段时间才有统计意义。
