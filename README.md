# 学管复盘助手

把学管师当天零散、口语化的工作流水账，整理成可以直接复制到钉钉工作群的规范复盘。

- 输入随便写，AI 负责归类、补全和排版
- 先追问补全，最多 3 轮、每轮 3 个问题，可跳过；选项支持单选/多选
- 追问阶段只出问题、不生成正文，回答完或跳过后才生成，省 token
- 五个核心栏目为空时会主动确认，答“没有”就保持空栏
- 固定话术：开启后每天根据当天内容生成 2-3 句服务/业绩话术；AI 不可用时按日期轮换固定库，她写了内容也会保留并追加
- 生成后可以逐条修改、移动到其他栏目、删除
- 一键复制，纯文本 + emoji，粘贴到钉钉不会带 Markdown 符号
- 支持语音输入：电脑端边说边转文字；安卓微信等不支持 Web Speech 的环境自动改用录音转写（需配置硅基流动 Key）
- 长期记忆：每天最后一次复制时提取关键信息，之后生成复盘时自动参考；可在“记忆”页查看和编辑
- 历史存档，第二天生成时会参考最近两天的内容
- 手机 / 电脑都能用，支持添加到主屏幕

## 技术栈

- Next.js 16（App Router、Turbopack）
- React 19 + TypeScript + Tailwind CSS 4
- Supabase Postgres + Drizzle ORM（本地默认用 PGlite，无需装数据库）
- DeepSeek OpenAI 兼容接口，模型默认 `deepseek-flash`
- 单密码登录 + HttpOnly 签名 Cookie

## 快速开始（本地）

```bash
npm install
```

复制环境变量模板并填写：

```bash
cp .env.example .env.local
```

至少填这三项：

```env
REVIEW_DEEPSEEK_API_KEY=你的 DeepSeek Key
APP_PASSWORD=你的访问密码
AUTH_SECRET=随机长字符串
```

`AUTH_SECRET` 可以用下面的命令生成：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Key 不要发到聊天里，也不要用系统里已有的 `DEEPSEEK_API_KEY`。本项目故意使用 `REVIEW_DEEPSEEK_API_KEY`，避免和系统环境变量冲突。

初始化本地数据库：

```bash
npm run db:migrate
```

启动：

```bash
npm run dev
```

打开 `http://localhost:3000`，输入 `APP_PASSWORD` 里的密码即可。

本地数据库是 `.data/pglite` 目录下的 PGlite，已被 `.gitignore` 排除。想重置本地数据：先停掉开发服务器，删除 `.data/pglite`，再运行 `npm run db:migrate`（会清空复盘和学生）。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `REVIEW_DEEPSEEK_API_KEY` | 是（不填会走兜底草稿） | 项目专用 DeepSeek Key，只在服务端读取 |
| `REVIEW_DEEPSEEK_MODEL` | 否 | 默认 `deepseek-flash`，换模型只改这里 |
| `REVIEW_DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com`，走代理时改这里 |
| `REVIEW_ASR_API_KEY` | 否 | 硅基流动 SiliconFlow Key；不填则录音转写不可用，不影响手动打字 |
| `REVIEW_ASR_BASE_URL` | 否 | 默认 `https://api.siliconflow.cn/v1` |
| `REVIEW_ASR_MODEL` | 否 | 默认 `FunAudioLLM/SenseVoiceSmall` |
| `APP_PASSWORD` | 是 | 登录密码，服务端比较 |
| `AUTH_SECRET` | 是 | Cookie 签名密钥，建议 `openssl rand -hex 32` 重新生成 |
| `DATABASE_URL` | 生产必填 | Supabase / Postgres 连接串；本地留空则用 PGlite |
| `PGLITE_DATA_DIR` | 否 | 本地 PGlite 目录，默认 `.data/pglite` |

没有配置 `REVIEW_DEEPSEEK_API_KEY` 时，应用不会崩溃：会把原文按句号/分号拆成【学情跟进】，并提示“AI 暂时没有连上”，方便先验证页面和流程。

## 长期记忆

- 每天第一次点“复制到钉钉”，或者手动点预览卡里的“记住今天”时，系统会从当天最终复盘里提取值得长期保留的信息：学生习惯、薄弱点、家长偏好、报名/续费进度、工作流程等。
- 每天最多自动提取一次，重复复制不会重复调用 AI；内容改过后可以点“更新记忆”。
- 之后生成追问或最终稿时，只把“通用记忆 + 今天提到的学生记忆”发给 AI，让追问和正文更连贯。
- 导航“记忆”页可以按学生/通用查看、编辑、删除；设置里可以关闭“长期记忆”。
- 提取会额外调用一次 DeepSeek；关闭长期记忆后既不提取也不参考。

## 部署到 Vercel + Supabase

> 下面按“零部署经验”写。Vercel 负责运行网页，Supabase 负责存数据库；本地 PGlite 数据不会自动带过去。

### 1. 创建 Supabase 数据库

1. 在 [supabase.com](https://supabase.com) 新建免费项目，区域优先选 **Singapore（新加坡）**，尽量和 Vercel 函数区域一致。
2. 创建后等 1-2 分钟，进入 **Project Settings → Database → Connection string**。
3. 这里有两种连接串，用途不同：
   - **Session pooler（端口 5432）**：临时用于建表和后续迁移。
   - **Transaction pooler（端口 6543）**：给 Vercel 运行时使用。
4. 复制 **Session pooler** 的 URI，替换其中的 `[YOUR-PASSWORD]`，确认带 `?sslmode=require`。不要保留 `pgbouncer=true` 或 `connection_limit=1`，这两个是 Prisma 专用参数。
5. 打开 Git Bash，在项目目录执行一次迁移。把单引号里的示例 URL 换成你的 Session pooler URL：

```bash
cd /c/Users/lxqwe/Desktop/Work-Summary
DATABASE_URL='postgresql://postgres.xxxx:REPLACE_ME@aws-0-xxxx.pooler.supabase.com:5432/postgres?sslmode=require' npm run db:migrate
```

这样只在这一次命令里使用生产连接，不会改 `.env.local`，本地 dev server 可以继续用 PGlite。

迁移成功后，Supabase 里会出现 `reviews`、`students`、`settings` 三张表，并记录 Drizzle 的迁移历史。以后加了数据库字段，也用同样的方式再跑一次迁移。

6. 迁移失败时先不要反复执行。常见原因是密码错误、连接串没带 `sslmode=require`，或把 Transaction pooler 当成迁移连接。按报错修正后重试。

7. 安全加固：在 Supabase **SQL Editor** 执行一次，禁止匿名 API 直接读写这些表（本项目只用数据库连接，不用 Supabase 前端 SDK）：

```sql
revoke all on table public.reviews from anon, authenticated;
revoke all on table public.students from anon, authenticated;
revoke all on table public.settings from anon, authenticated;
```

### 2. 推到 GitHub

1. 在 GitHub 新建一个 **Private** 仓库，不要勾选自动生成 README。
2. 在项目目录执行：

```bash
git init
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
git add .
git status --short
```

确认列表里**没有** `.env.local`、`.data/`、`.tmp-test/`、`样例（按时间升序）.md`。确认后再提交：

```bash
git commit -m "chore: 初始化学管复盘助手"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

第一次 `push` 时 Git 可能会打开浏览器让你登录 GitHub，按提示授权即可。仓库必须保持 **Private**。

### 3. 部署到 Vercel

1. 用 GitHub 账号登录 [vercel.com](https://vercel.com)，点 **Add New → Project**，导入刚才的私有仓库。
2. Framework Preset 会自动识别为 **Next.js**；Root Directory 保持 `./`；Build Command 和 Output Directory 保持默认。
3. 在 **Settings → General → Node.js Version** 选择 **22.x**。
4. 在 **Settings → Functions → Function Region** 选择 **Singapore (sin1)**，和 Supabase 区域靠近。Hobby 套餐只能选一个区域；如果默认勾着 `iad1`，先取消再选，否则可能部署失败。
5. 在 **Environment Variables** 添加以下变量，作用域选 **Production**（需要预览环境就再加 Preview）：

| 变量 | 值 |
| --- | --- |
| `REVIEW_DEEPSEEK_API_KEY` | 项目专用 DeepSeek Key |
| `REVIEW_DEEPSEEK_MODEL` | `deepseek-flash` |
| `REVIEW_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `REVIEW_ASR_API_KEY` | 硅基流动 SiliconFlow Key（可选，用于安卓微信录音转写） |
| `REVIEW_ASR_BASE_URL` | `https://api.siliconflow.cn/v1` |
| `REVIEW_ASR_MODEL` | `FunAudioLLM/SenseVoiceSmall` |
| `APP_PASSWORD` | 新的强访问密码，至少 20 位，不要沿用本地旧密码 |
| `AUTH_SECRET` | 新生成的随机串，不要和本地共用 |
| `DATABASE_URL` | Supabase **Transaction pooler** URI，端口 6543 |

生成 `AUTH_SECRET` 可以本地执行：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`DATABASE_URL` 记得替换密码、保留 `sslmode=require`，删除 `pgbouncer=true` 和 `connection_limit=1`。**不要配置 `PGLITE_DATA_DIR`**。

6. 点 **Deploy**。部署完成后打开 `https://你的项目.vercel.app`，用新的 `APP_PASSWORD` 登录。
7. 第一次进入后添加林小满（以及后续学生），写一条测试流水账，确认“追问 → 正文 → 复制”和语音输入都正常；安卓微信里再测一次录音转写。
8. 以后改了环境变量，需要在 Deployments 里 **Redeploy** 才会生效。

> 生成接口设置了 `maxDuration = 60`。如果 Vercel Hobby 仍频繁超时，先确认是否开启 Fluid Compute；仍不行就考虑升级或换普通 Node 服务器。
>
> Vercel 免费版在国内可能偶尔慢或短时不稳定。先手机实测；如果影响每天使用，可以把同一套代码迁到香港/国内 Node 服务器，Supabase 数据库不用换。Supabase 免费项目长时间不访问会暂停，按控制台提示恢复即可。

### 4. 手机使用

- Vercel 默认提供 HTTPS，直接用手机浏览器打开部署域名。
- iPhone Safari：分享 → **添加到主屏幕**；Android Chrome：菜单 → **安装应用 / 添加到主屏幕**。
- 语音输入必须使用 HTTPS。
- 电脑/支持的浏览器使用自带 Web Speech API，边说边转文字；Chrome 的语音服务依赖 Google 网络，国内可能连接失败。
- 安卓微信不支持 Web Speech API，会自动切换为“录音转写”：录完上传到服务端，由硅基流动 SenseVoiceSmall 转成文字。首次使用需允许麦克风，单次最长 60 秒。
- 没配置 `REVIEW_ASR_API_KEY` 时，录音转写会提示服务未配置，直接打字即可。

### 5. 后续更新

- 改代码后 `git add . && git commit -m "..." && git push`，Vercel 会自动部署。
- 改了数据库结构，需要在本地重新用 Session pooler URL 跑 `npm run db:migrate`，不要把生产 URL 长期留在 `.env.local`。
- **本次长期记忆版本新增了 `memories` 表，以及 `reviews.memory_extracted_at`、`settings.enable_memory` 两列。部署新代码前，必须先用 Session pooler 命令跑一次 `npm run db:migrate`，否则首页和设置页会因为缺列报错。**
- **生产库不要执行 `npm run db:push`**，它可能直接改表结构甚至丢列；生产只用生成迁移 + `db:migrate`。

> 本地 PGlite 里的学生和历史复盘不会自动迁移到 Supabase。线上第一次使用需要重新添加学生；如果需要把本地历史搬到线上，先停下来单独处理。

## 使用流程

1. **学生页**：第一次进去点“添加林小满”，年级、科目可以留空，后面再补。
2. **今日复盘**：把今天做的事随便写进输入框，选“简洁/详细”，点“生成复盘”。也可以点“语音输入”，边说边转文字，识别结果会换行追加到末尾。
3. **回答追问**：AI 先分析缺口并追问，不生成正文；每轮最多 3 个问题，最多 3 轮。点选项或直接写，多选问题可以点多个；不想答就点“跳过追问并生成”。
4. **生成正文**：没有更多问题、答完第 3 轮或跳过追问后，才会生成完整复盘正文。
5. **调整内容**：点“编辑内容”，可以逐条改、移动到其他栏目、删除或新增。
6. **复制发送**：点“复制”或底部“复制到钉钉”，去钉钉工作群粘贴。
7. **历史**：按日期倒序查看；还在追问中的会显示“待补全”，点开可以继续回答。

> 手动点“重新生成”会重新开始追问周期：轮次重置，但已经写的内容和问答记录会保留。五个核心栏目（学情跟进、家校沟通、业绩跟踪、日常工作复盘、小橙Ai推进）如果有空缺，AI 会主动问有没有内容；“工作困难”和“教研相关”这两个可选栏目不会主动追问。
>
> 编辑后大约 1.6 秒会自动保存。如果你马上要关闭页面或切到别的页面，先点一下“保存”，避免最后一句还没提交。

## 栏目规则

- **学情跟进**：学生作业、错题、上课、自习、排课、课时核对、值班、课表、通知、巡课等今天实际做的事。
- **家校沟通**：家长的沟通，尽量有对象、渠道（微信/电话/面聊）、内容/结果。
- **业绩跟踪**：试听、续费、签单、转介绍、扩科、课耗、到访。
- **日常工作复盘**：反思、改进、会议、计划。
- **小橙Ai推进**：错题/信息录入、错题收集。
- **工作困难**：默认不显示，可在设置里打开；没内容时自动写“目前没有困难，有困难都已经想办法解决。”
- **教研相关**：默认开启，有教讨会/教研内容时才出现。

AI 归类不完美时，可以在“编辑内容”里一键移动到其他栏目。

## 常用命令

```bash
npm run dev         # 开发
npm run build       # 生产构建
npm run start       # 启动生产构建
npm run typecheck   # TypeScript 检查
npm test            # Vitest 单元测试
npm run eval        # 模板结构测试；配置了 Key 后会跑 3 条真实 AI 用例 + 追问到最终稿检查
npm run db:generate # 改了 schema 后生成迁移 SQL
npm run db:migrate  # 应用迁移（PGlite 或 Supabase）
```

> `npm run db:push` 只适合本地调试。不要对 Supabase 生产库执行，可能直接改表结构或丢数据。

可选的浏览器测试：

```bash
pip install playwright
python -m playwright install chromium
PYTHONIOENCODING=utf-8 APP_PASSWORD=你的访问密码 python scripts/ui-test.py
```

需要开发服务器已经在 `http://localhost:3000` 运行。测试会临时新增/删除一个“测试学生”，并写入 11 月 11 日的复盘。**运行前确认本地 `.env.local` 的 `DATABASE_URL` 是空的**，否则可能写进生产库。

## 隐私与安全

- 学生姓名、家长沟通内容会发送给 DeepSeek API。当前版本按你的选择**不做脱敏**。
- 电脑端语音输入使用浏览器自带的 Web Speech API，音频可能由 Chrome（Google）或 Safari（Apple）的语音服务处理，不经过本项目服务器。
- 安卓微信等录音转写场景，录音会先上传到本项目服务端，再由服务端发送给硅基流动 SiliconFlow 转写；本项目不会把录音写入数据库。介意的话可以直接打字。
- 长期记忆保存在 Supabase/本地 PGlite；提取时会把当天最终复盘发给 DeepSeek。记忆页可以查看、编辑或删除，设置里可以整体关闭。
- DeepSeek Key 只在服务端读取，不会出现在浏览器 bundle 里。
- 页面有单密码保护；Cookie 是 HttpOnly + SameSite=Lax，生产环境自动加 Secure。
- 生产环境的历史记录存在 Supabase；本地开发存在 `.data/pglite`。
- 仓库必须保持 Private；`.env.local` 已被 `.gitignore` 排除，含真实学生/家长信息的 `样例（按时间升序）.md` 也不会提交。
- 上线前建议重新生成 DeepSeek Key、访问密码和 `AUTH_SECRET`。改 `APP_PASSWORD` 不会让已经登录的设备立刻失效；需要让旧会话全部失效时，轮换 `AUTH_SECRET`。
- Vercel 的数据库错误日志可能包含查询参数，不要把日志原样发到公开群聊或 issue。

## 目录结构

```
app/
  (app)/            登录后的页面：工作台、历史、学生、设置
  api/              登录、生成、保存、学生、设置接口
  login/            登录页
components/
  workspace/        工作台交互
  students/         学生管理
  history/          历史列表
  settings/         设置
  ui/               基础 UI 组件
lib/
  ai/               DeepSeek 调用与提示词
  db/               Drizzle schema、连接、查询
  auth*.ts          登录态
  template.ts       最终复盘渲染
  schema.ts         Zod 校验
  draft.ts          草稿清洗/兜底
drizzle/            迁移 SQL
scripts/            迁移、AI 评测、UI 测试
tests/              Vitest 单测
```

## 常见问题

**追问阶段为什么看不到复盘正文？**

这是故意的：现在先只生成问题，等你回答完或点“跳过追问并生成”后再生成正文，避免半成品预览，也节省 token。

**切换“简洁/详细”会重写正文吗？**

会以当前正文为底稿，只调整措辞和详略，保留所有栏目、条目数量和用户编辑；不会重新从流水账提取，也不会增删条目。

**生成时提示“服务端还没有配置 REVIEW_DEEPSEEK_API_KEY”**

在 `.env.local` 里填 `REVIEW_DEEPSEEK_API_KEY`，然后重启 `npm run dev`。Vercel 上要重新部署或至少 redeploy 让新环境变量生效。

**安卓微信点语音提示“没有听到声音”或很快自动停止**

这是微信内核不支持 Web Speech API 导致的。新版会自动切换为录音转写：再点一次麦克风，允许麦克风权限，说完点“停止并转写”。如果提示“服务端还没有配置 REVIEW_ASR_API_KEY”，先去 [硅基流动](https://cloud.siliconflow.cn/) 注册、实名认证，再到控制台创建 API 密钥，填到 `.env.local` 或 Vercel 环境变量后重启/重新部署。

**提示 401 / 模型不存在**

检查 Key 是否有效；检查 `REVIEW_DEEPSEEK_MODEL` 是否是服务商实际支持的模型名。默认是 `deepseek-flash`。

**提示“数据库还没准备好”**

运行 `npm run db:migrate`。如果用的是 Supabase，确认 `.env.local` 或 Vercel 的 `DATABASE_URL` 是 Transaction pooler 连接串；迁移本身要用 Session pooler / Direct connection。

**Vercel 报“生产环境必须配置 DATABASE_URL”**

生产环境不会再用本地 PGlite。到 Vercel 的 Environment Variables 添加 Supabase Transaction pooler 连接串，然后 Redeploy。

**连接 Supabase 报 `unsupported startup parameter: pgbouncer` 或 `connection_limit`**

连接串里混进了 Prisma 专用参数。删除 `pgbouncer=true` 和 `connection_limit=1`，保留 `sslmode=require`。本项目已经会自动清理这两个参数，但迁移脚本和外部工具仍建议手动去掉。

**数据库报 `relation does not exist` / 没有表**

建表迁移没有跑成功，或者 Vercel 连到了另一个 Supabase 项目。先用 Session pooler 跑 `npm run db:migrate`，再到 Supabase Table Editor 确认三张表。

**生成时 504 / 超时**

生成接口最长 60 秒，AI 单次请求已限制 25 秒。若仍频繁超时，检查 Vercel 是否开启 Fluid Compute、函数区域是否离 Supabase 太远；必要时升级套餐或换普通 Node 服务器。

**Vercel 构建卡在 npm 安装**

`package-lock.json` 已改为官方 `registry.npmjs.org`。如果日志仍出现 `registry.npmmirror.com`，说明手动改过 lockfile，重新拉取仓库版本再部署。不要提交指向国内镜像的 lockfile。

**PGlite 初始化失败 / 数据库被锁**

PGlite 同一时间只能被一个进程打开。不要同时开多个 `npm run dev`，也不要在开发服务器运行时执行迁移。生产环境请用 Supabase/Postgres。

**复制按钮在公网 HTTP 下没反应**

Clipboard API 需要 HTTPS 或 localhost。应用有 `execCommand` 兜底，但最好部署到 HTTPS。

**手机上日期显示成 `11/13/2026`**

这是浏览器本地化的显示格式，实际提交的是 `2026-11-13`，不影响复盘日期。

## 后续可以加

- 每日定时提醒
- 周报/月报汇总
- 模板可视化编辑
- 姓名脱敏开关
- 钉钉自动发送（需要企业管理员权限）
