# 常见问题

## 追问阶段为什么看不到正文？

这是刻意设计。追问阶段只生成问题，不生成正文，回答完或跳过追问后才进入最终稿。这样避免展示半成品，也避免为最终会被替换的内容付费。

## 切换「简洁 / 详细」会重写内容吗？

不会重新提取事实。改文风以当前草稿为唯一底稿，只调整措辞和详略，保留所有栏目、条目数量、顺序和用户编辑。模型返回的条目数不一致时，程序会拒绝结果并保留原稿。

## 生成提示「服务端还没有配置 REVIEW_DEEPSEEK_API_KEY」

在服务器项目目录的 `.env` 填写 `REVIEW_DEEPSEEK_API_KEY`，然后执行 `sudo systemctl restart work-summary`；本地开发改 `.env.local` 后重启 `npm run dev`。未配置时应用不会崩，会按原文生成兜底草稿。

## 提示 401 / 模型不存在

- 检查 Key 是否有效；
- 检查 `REVIEW_DEEPSEEK_MODEL` 是否是服务商实际支持的模型名；
- 检查 `REVIEW_DEEPSEEK_BASE_URL` 是否指向兼容 OpenAI 协议的接口。

## 提示「数据库还没准备好」

本地运行：

```bash
npm run db:migrate
```

服务器环境确认：

- `.env` 里的 `DATABASE_URL` 是 Supabase/Postgres 连接串；
- 用同一个连接串执行 `npm run db:migrate`；
- 迁移后 Supabase Table Editor 能看到 `reviews`、`students`、`settings`、`memories`、`usage_events` 五张表。

## 生产环境报「必须配置 DATABASE_URL」

生产环境不会回退到 PGlite。编辑服务器项目目录的 `.env`，填入 Supabase/Postgres 连接串，然后执行 `sudo systemctl restart work-summary`。下次自动部署会重新执行迁移和构建。

## 连接 Supabase 报 `unsupported startup parameter: pgbouncer`

连接串里混入了 Prisma 专用参数。删除 `pgbouncer=true` 和 `connection_limit=1`，保留 `sslmode=require`。应用运行时和迁移脚本都会自动清理这两个参数；如果用 `psql` 等外部工具连接，仍需手动去掉。

## 数据库报 `relation does not exist` / 没有表

建表迁移没有跑成功，或者服务器 `.env` 的 `DATABASE_URL` 指向了另一个 Supabase 项目。用正确的连接串执行 `npm run db:migrate`，再到 Table Editor 确认表是否存在。

## 生成时 504 / 超时

- 先看 `systemctl status work-summary` 和服务日志（`journalctl -u work-summary -n 100 --no-pager`）；
- 检查 Nginx/Caddy 的反向代理超时是否短于实际生成耗时；
- 检查模型是否限流、服务器出口网络是否正常；
- 本机 `curl http://127.0.0.1:3000/login` 正常但外网超时，重点检查反向代理和防火墙。

## GitHub Actions / `scripts/deploy.sh` 部署失败

按顺序检查：

1. `SERVER_HOST`、`SERVER_USER`、`SERVER_SSH_KEY`、`SSH_KNOWN_HOSTS` 是否都配置；
2. CI 是否在 `main` 上成功完成；
3. 私钥是否与服务器 `~/.ssh/authorized_keys` 匹配，`SSH_KNOWN_HOSTS` 是否是当前服务器的 host key；
4. 服务器项目目录是否有未提交改动（`git status --short` 必须为空）；
5. `git pull --ff-only origin main` 是否因本地分叉失败；
6. `npm ci`、`npm run build` 是否失败或 OOM；
7. 部署用户是否能免密执行 `sudo systemctl restart work-summary`；
8. 最后一步 `curl http://127.0.0.1:3000/login` 是否成功。

## 服务器 502 / 打不开

- `systemctl status work-summary` 看服务是否在运行；
- `curl http://127.0.0.1:3000/login` 看应用是否响应；
- 检查 Nginx/Caddy 的 upstream 是否指向 `127.0.0.1:3000`，以及 80/443 端口和防火墙；
- 查看 `journalctl -u work-summary` 和反向代理错误日志。

## 服务器构建卡在 npm 安装 / 内存不足

`package-lock.json` 应指向官方 `registry.npmjs.org`；如果日志出现 `registry.npmmirror.com`，重新拉取仓库版本。`scripts/deploy.sh` 默认用 `NODE_OPTIONS=--max-old-space-size=1536` 构建；小内存服务器可调大或增加 swap。

## `AUTH_SECRET` 报错或登录失败

生产环境 `AUTH_SECRET` 至少 32 字节。用 `openssl rand -hex 32` 或 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成，写入服务器 `.env` 后执行 `sudo systemctl restart work-summary`。更换 `AUTH_SECRET` 会使现有登录 Cookie 失效，需要重新登录。

## HSTS 重复 / 想关闭应用层 HSTS

默认开启 HSTS。如果 Nginx/Caddy 已经统一添加 `Strict-Transport-Security`，在服务器 `.env` 设置 `DISABLE_HSTS=1` 并重启服务。HSTS 只对 HTTPS 响应生效，纯 HTTP 调试可以忽略。

## 修改服务器环境变量后怎么生效

编辑服务器项目目录的 `.env`，然后执行 `sudo systemctl restart work-summary`。GitHub Actions 只部署代码，不会修改服务器 `.env`。

## 自动部署会覆盖服务器 `.env` 吗

不会。`.env` 不在仓库里，`scripts/deploy.sh` 只做 `git pull`、`npm ci`、迁移、构建和重启。

## PGlite 初始化失败 / 数据库被锁

PGlite 同一时间只能被一个进程打开。不要同时开多个 `npm run dev`，也不要在开发服务器运行时执行迁移。生产环境请用 Supabase/Postgres。

## 复制按钮在公网 HTTP 下没反应

Clipboard API 需要 HTTPS 或 localhost。给 Nginx/Caddy 配置 HTTPS；应用有 `execCommand` 兜底，但仍建议使用 HTTPS。

## 手机上日期显示成 `11/13/2026`

这是浏览器本地化格式，实际提交的是 `2026-11-13`，不影响复盘日期。

## 安卓微信点语音提示「没有听到声音」

微信内核不支持 Web Speech API。新版会自动切换为录音转写：再点一次麦克风，允许权限，说完点「停止并转写」。未配置 `REVIEW_ASR_API_KEY` 时提示直接打字；录音转写要求 WAV、单文件不超过 4MB（约 60 秒），格式不对会提示重新录。

## `/demo` 是什么？

免登录演示页，使用 `lib/demo-data.ts` 的内存数据，不读写正式数据库，刷新后恢复初始状态。已登录用户默认进入正式工作台；需要查看演示时访问 `/demo?preview=1`。

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

## 记忆库需要手动维护吗？过期记忆会影响追问吗？

不需要手动维护。提取时会自动把记忆分成两类：

- 长期记忆：学生特点、学习习惯、家长长期偏好、固定工作规范，永久保留；
- 阶段性记忆：本周待办、某次补课或考试安排、临时请假，默认 7 天有效，最长 90 天。

阶段性记忆到期后不会立刻删除，而是进入 5 天待归档宽限期。复盘页顶部会出现一条轻提示，点开可以「保留」为长期记忆或「现在归档」；不操作则宽限期结束后自动软归档。已归档记忆不会进入生成或追问的上下文，但仍可在记忆页底部的「已归档」折叠区恢复为长期记忆。

只有你在记忆页手动点删除，才会物理删除。存量记忆默认全部按长期保留；如果想给老记忆做一次分类，先运行 `npm run memories:classify` 查看 dry-run 建议，确认后加 `--apply` 回填。

## 数据会发送给哪些第三方？

- DeepSeek：流水账、问答、最终复盘、记忆抽取内容；
- SiliconFlow：录音转写时的音频；
- 浏览器语音服务：电脑端 Web Speech 的音频可能由 Chrome/Google 或 Safari/Apple 处理。

当前版本按用户选择不做脱敏。敏感场景建议先在本地做姓名替换，或关闭长期记忆和语音转写。
