# 常见问题

## 追问阶段为什么看不到正文？

这是刻意设计。追问阶段只生成问题，不生成正文，回答完或跳过追问后才进入最终稿。这样避免展示半成品，也避免为最终会被替换的内容付费。

## 切换「简洁 / 详细」会重写内容吗？

不会重新提取事实。改文风以当前草稿为唯一底稿，只调整措辞和详略，保留所有栏目、条目数量、顺序和用户编辑。模型返回的条目数不一致时，程序会拒绝结果并保留原稿。

## 生成提示「服务端还没有配置 REVIEW_DEEPSEEK_API_KEY」

在 `.env.local` 或部署平台环境变量里填写 `REVIEW_DEEPSEEK_API_KEY`，然后重启开发服务器或重新部署。未配置时应用不会崩，会按原文生成兜底草稿。

## 提示 401 / 模型不存在

- 检查 Key 是否有效；
- 检查 `REVIEW_DEEPSEEK_MODEL` 是否是服务商实际支持的模型名；
- 检查 `REVIEW_DEEPSEEK_BASE_URL` 是否指向兼容 OpenAI 协议的接口。

## 提示「数据库还没准备好」

本地运行：

```bash
npm run db:migrate
```

Supabase 环境确认：

- `.env.local` 或 Vercel 的 `DATABASE_URL` 是 Transaction pooler 连接串；
- 迁移本身用 Session pooler / Direct connection；
- 迁移后 Supabase Table Editor 能看到五张表。

## Vercel 报「生产环境必须配置 DATABASE_URL」

生产环境不会回退到 PGlite。到 Vercel 添加 Supabase Transaction pooler 连接串，然后 Redeploy。

## 连接 Supabase 报 `unsupported startup parameter: pgbouncer`

连接串里混入了 Prisma 专用参数。删除 `pgbouncer=true` 和 `connection_limit=1`，保留 `sslmode=require`。项目会自动清理这两个参数，但迁移脚本和外部工具仍建议手动去掉。

## 数据库报 `relation does not exist` / 没有表

建表迁移没有跑成功，或者 Vercel 连到了另一个 Supabase 项目。先用 Session pooler 跑 `npm run db:migrate`，再到 Table Editor 确认表是否存在。

## 生成时 504 / 超时

生成接口最长 60 秒，模型单次请求限制 25 秒。检查：

- Vercel 是否开启 Fluid Compute；
- 函数区域是否离 Supabase 太远；
- 是否频繁触发模型限流。

必要时升级套餐或换普通 Node 服务器。

## Vercel 构建卡在 npm 安装

`package-lock.json` 应指向官方 `registry.npmjs.org`。如果日志出现 `registry.npmmirror.com`，说明 lockfile 被改过，重新拉取仓库版本再部署。

## PGlite 初始化失败 / 数据库被锁

PGlite 同一时间只能被一个进程打开。不要同时开多个 `npm run dev`，也不要在开发服务器运行时执行迁移。生产环境请用 Supabase/Postgres。

## 复制按钮在公网 HTTP 下没反应

Clipboard API 需要 HTTPS 或 localhost。应用有 `execCommand` 兜底，但建议部署到 HTTPS。

## 手机上日期显示成 `11/13/2026`

这是浏览器本地化格式，实际提交的是 `2026-11-13`，不影响复盘日期。

## 安卓微信点语音提示「没有听到声音」

微信内核不支持 Web Speech API。新版会自动切换为录音转写：再点一次麦克风，允许权限，说完点「停止并转写」。如果提示未配置 `REVIEW_ASR_API_KEY`，先到 SiliconFlow 创建 Key 并填入环境变量。

## `npm run eval` 和 `npm run eval:ai` 有什么区别？

- `npm run eval`：离线检查数据集、Prompt 组装、模板，不需要 Key，可进 CI；
- `npm run eval:ai`：调用真实模型生成并评分，需要 Key，会产生 token 成本。

详见 [eval.md](eval.md)。

## `npm run stats` 没有数据

统计读取 `usage_events` 表，需要：

1. 已执行最新迁移（包含 `usage_events`）；
2. 部署/运行的是带埋点的新代码；
3. 至少有生成、保存或复制操作。

埋点只记录数量、枚举和耗时，不记录复盘原文或学生姓名。

## 长期记忆会不会越记越多？

抽取时会先按 `id` 更新；模型没有按 id 返回时，用字符二元组 Dice 相似度合并同学生、同分类的相似记忆。记忆页可以手动编辑、删除或整体关闭。

## 数据会发送给哪些第三方？

- DeepSeek：流水账、问答、最终复盘、记忆抽取内容；
- SiliconFlow：录音转写时的音频；
- 浏览器语音服务：电脑端 Web Speech 的音频可能由 Chrome/Google 或 Safari/Apple 处理。

当前版本按用户选择不做脱敏。敏感场景建议先在本地做姓名替换，或关闭长期记忆和语音转写。
