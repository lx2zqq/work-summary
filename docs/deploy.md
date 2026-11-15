# 部署指南

目标架构：**Vercel 运行 Next.js，Supabase 提供 Postgres**。本地默认使用 PGlite，不需要安装数据库。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `REVIEW_DEEPSEEK_API_KEY` | 是（不填走兜底草稿） | DeepSeek Key，只在服务端读取 |
| `REVIEW_DEEPSEEK_MODEL` | 否 | 默认 `deepseek-flash` |
| `REVIEW_DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `REVIEW_ASR_API_KEY` | 否 | SiliconFlow Key，用于录音转写 |
| `REVIEW_ASR_BASE_URL` | 否 | 默认 `https://api.siliconflow.cn/v1` |
| `REVIEW_ASR_MODEL` | 否 | 默认 `FunAudioLLM/SenseVoiceSmall` |
| `APP_PASSWORD` | 是 | 访问密码，服务端比较 |
| `AUTH_SECRET` | 是 | Cookie 签名密钥 |
| `DATABASE_URL` | 生产必填 | Supabase 连接串；本地留空用 PGlite |
| `PGLITE_DATA_DIR` | 否 | 本地 PGlite 目录，默认 `.data/pglite` |

生成 `AUTH_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 1. 创建 Supabase 数据库

1. 在 [supabase.com](https://supabase.com) 新建项目，区域优先选 **Singapore**，和 Vercel 函数区域靠近。
2. 进入 **Project Settings → Database → Connection string**。
3. 记下两种连接串：
   - **Session pooler（5432）**：用于建表和迁移；
   - **Transaction pooler（6543）**：用于 Vercel 运行时。
4. 复制 Session pooler URI，替换密码，保留 `?sslmode=require`。不要带 `pgbouncer=true` 或 `connection_limit=1`。

## 2. 执行迁移

在项目目录执行一次：

```bash
DATABASE_URL='postgresql://postgres.xxxx:REPLACE_ME@aws-0-xxxx.pooler.supabase.com:5432/postgres?sslmode=require' npm run db:migrate
```

迁移成功后会出现 `reviews`、`students`、`settings`、`memories`、`usage_events` 五张表，以及 Drizzle 的迁移历史。

建议在 Supabase SQL Editor 执行一次，禁止匿名 API 直接读写：

```sql
revoke all on table public.reviews from anon, authenticated;
revoke all on table public.students from anon, authenticated;
revoke all on table public.settings from anon, authenticated;
revoke all on table public.memories from anon, authenticated;
revoke all on table public.usage_events from anon, authenticated;
```

> 生产库不要执行 `npm run db:push`，它可能直接改表结构或丢列。生产只用 `db:generate` + `db:migrate`。

## 3. 部署到 Vercel

1. 把仓库推到 GitHub（建议 Private），在 Vercel 导入。
2. Framework Preset 自动识别为 Next.js，Root Directory 保持 `./`。
3. **Settings → General → Node.js Version** 选择 **22.x**。
4. **Settings → Functions → Function Region** 选择 **Singapore (sin1)**，和 Supabase 靠近。
5. 在 **Environment Variables** 添加：

| 变量 | 值 |
| --- | --- |
| `REVIEW_DEEPSEEK_API_KEY` | 项目专用 Key |
| `REVIEW_DEEPSEEK_MODEL` | `deepseek-flash` |
| `REVIEW_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `REVIEW_ASR_API_KEY` | SiliconFlow Key（可选） |
| `APP_PASSWORD` | 至少 20 位的新密码 |
| `AUTH_SECRET` | 新生成的随机串 |
| `DATABASE_URL` | Supabase **Transaction pooler** URI，端口 6543 |

6. 点击 Deploy。部署完成后用 `APP_PASSWORD` 登录。
7. 第一次进入后添加学生，写一条测试流水账，确认「追问 → 正文 → 复制」正常。

生产接口设置了 `maxDuration = 60`，单次模型请求超时 25 秒。Vercel Hobby 如果频繁超时，先确认是否开启 Fluid Compute，仍不行再考虑升级或换普通 Node 服务器。

## 4. 手机使用

- Vercel 默认提供 HTTPS，手机浏览器直接打开域名。
- iPhone Safari：分享 → 添加到主屏幕；Android Chrome：菜单 → 安装应用。
- 语音输入必须 HTTPS。
- 电脑/支持的浏览器使用 Web Speech API；Chrome 的语音服务依赖 Google 网络，国内可能失败。
- 安卓微信不支持 Web Speech API，会自动切换为录音转写：录音上传到服务端，再由服务端调用 SiliconFlow。未配置 `REVIEW_ASR_API_KEY` 时提示直接打字。

## 5. 后续更新

```bash
git add .
git commit -m "feat: ..."
git push
```

Vercel 自动部署。改了数据库结构时：

1. 本地 `npm run db:generate` 生成迁移；
2. 用 Session pooler URL 执行 `npm run db:migrate`；
3. 再部署代码。

**本次新增了 `usage_events` 表，部署新代码前必须先跑一次迁移**，否则埋点写入会失败（不影响生成，但统计为空）。

## 6. 常见部署问题

详细的报错处理见 [faq.md](faq.md)。几个高频问题：

- **`unsupported startup parameter: pgbouncer`**：连接串里混入了 Prisma 专用参数，删掉 `pgbouncer=true` 和 `connection_limit=1`。
- **`relation does not exist`**：迁移没跑成功，或 Vercel 连到了另一个 Supabase 项目。
- **构建卡在 npm 安装**：`package-lock.json` 不应指向国内镜像，使用官方 `registry.npmjs.org`。
- **PGlite 初始化失败 / 数据库被锁**：同一时间只能有一个进程打开 PGlite，不要同时开多个 dev server 或边跑 dev 边迁移。
- **复制按钮在 HTTP 下没反应**：Clipboard API 需要 HTTPS 或 localhost，应用有 `execCommand` 兜底，但建议部署到 HTTPS。

## 7. 公开演示建议

仓库公开时建议只放脱敏截图或录屏，不要直接暴露真实学生数据。如果之后要提供在线 demo：

- 使用独立数据库，只放假数据；
- 设置访客密码和每日生成配额；
- 限制语音转写和记忆写入；
- 定期重置数据；
- 监控 API Key 消耗。
