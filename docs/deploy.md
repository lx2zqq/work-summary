# 部署指南

目标架构：

- 本地开发：PGlite，不需要安装数据库；
- 生产数据库：Supabase Postgres；
- 应用：Next.js 以 Node 服务常驻腾讯云轻量服务器，systemd 托管，Nginx/Caddy 反向代理；
- 发布：GitHub Actions 在 `main` 的 CI 通过后，通过 SSH 执行 `scripts/deploy.sh`。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `REVIEW_DEEPSEEK_API_KEY` | 否（不填走兜底草稿） | DeepSeek Key，只在服务端读取 |
| `REVIEW_DEEPSEEK_MODEL` | 否 | 默认 `deepseek-flash` |
| `REVIEW_DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `REVIEW_TOOLS_MODE` | 否 | `auto`（默认，模型自主查询，失败时降级）或 `off`（强制全量预注入） |
| `REVIEW_ASR_API_KEY` | 否 | SiliconFlow Key，用于录音转写；不填时录音转写不可用，仍可直接打字 |
| `REVIEW_ASR_BASE_URL` | 否 | 默认 `https://api.siliconflow.cn/v1` |
| `REVIEW_ASR_MODEL` | 否 | 默认 `FunAudioLLM/SenseVoiceSmall` |
| `APP_PASSWORD` | 是 | 访问密码，服务端校验 |
| `AUTH_SECRET` | 是 | Cookie 签名密钥，至少 32 字节 |
| `DATABASE_URL` | 生产必填 | Supabase/Postgres 连接串；本地留空使用 PGlite |
| `PGLITE_DATA_DIR` | 否 | 本地 PGlite 目录，默认 `.data/pglite` |
| `DISABLE_HSTS` | 否 | 默认不设置（开启 HSTS）；设为 `1` 关闭应用层 HSTS，适用于反向代理统一添加 HSTS 的场景 |
| `CRON_SECRET` | 否 | 可选，定时推进记忆生命周期的接口密钥；不配置时接口返回 503 |

生成 `AUTH_SECRET`：

```bash
openssl rand -hex 32
# 或
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

生产环境把变量放在服务器的 `.env`（与项目同目录）。GitHub Actions 只负责代码部署，不会修改服务器上的 `.env`；改完环境变量后执行：

```bash
sudo systemctl restart work-summary
```

## 1. 本地开发

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

至少填写 `APP_PASSWORD` 和 `AUTH_SECRET`；`REVIEW_DEEPSEEK_API_KEY`、`REVIEW_ASR_API_KEY` 不填也能启动，分别走兜底草稿和直接打字。本地不填 `DATABASE_URL`，数据保存在 `.data/pglite`。打开 `http://localhost:3000` 登录；演示页 `/demo` 免登录。

## 2. 准备 Supabase Postgres

1. 在 [supabase.com](https://supabase.com) 新建项目，区域尽量靠近腾讯云服务器。
2. 在 **Project Settings → Database → Connection string** 复制 Postgres 连接串。
3. 保留 `sslmode=require`；如果连接串带 `pgbouncer=true` 或 `connection_limit=1`，手动删掉。应用运行时和迁移脚本都会自动清理这两个参数；如果用 `psql` 等外部工具连接，仍需手动去掉。
4. 执行迁移：

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
```

迁移成功后应看到 `reviews`、`students`、`settings`、`memories`、`usage_events` 五张表，以及 Drizzle 的迁移历史。

本次升级包含 `drizzle/0004_serious_lord_hawal.sql`（`memories` 生命周期字段）。`npm run db:migrate` 会自动执行；存量记忆默认 `lifecycle=permanent`，不会被自动归档。如需对旧记忆做一次性分类：

```bash
npm run memories:classify             # 默认 dry-run，只打印建议，不写库
npm run memories:classify -- --apply  # 确认 dry-run 结果后再写库
```

脚本每批 20 条调用 DeepSeek；`--apply` 只会把判定为阶段性的记忆推进到 `pending_archive`，保留 5 天宽限期，不会物理删除。

生产库不要执行 `npm run db:push`；改表结构时用 `npm run db:generate` 生成迁移，再用 `npm run db:migrate` 应用。

## 3. 部署到腾讯云轻量服务器

以下命令在服务器上执行。`scripts/deploy.sh` 的默认值是：

- 项目目录 `APP_DIR=/home/ubuntu/apps/work-summary`
- systemd 服务名 `SERVICE=work-summary`
- 应用默认监听 3000 端口，反向代理目标为 `127.0.0.1:3000`

如果实际路径或服务名不同，在服务器上设置 `APP_DIR` / `SERVICE`，或直接修改 `scripts/deploy.sh` 的默认值。

1. 安装 Node.js 22（与 CI 一致）、Git、Nginx 或 Caddy。
2. 把仓库克隆到默认目录：

```bash
git clone <仓库地址> /home/ubuntu/apps/work-summary
cd /home/ubuntu/apps/work-summary
git checkout main
```

3. 创建服务器 `.env`，填入生产变量（至少 `APP_PASSWORD`、`AUTH_SECRET`、`DATABASE_URL`）。
4. 首次安装依赖、迁移并构建：

```bash
npm ci
npm run db:migrate
npm run build
```

5. 用 systemd 托管 `npm start`。示例 unit（按服务器实际的 Node/npm 路径调整）：

```ini
[Unit]
Description=work-summary
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/apps/work-summary
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now work-summary
curl -fsS http://127.0.0.1:3000/login > /dev/null
```

6. 用 Nginx 或 Caddy 把 HTTPS 域名反代到 `127.0.0.1:3000`。手机语音和剪贴板都要求 HTTPS。
7. 如果反向代理已经统一添加 HSTS，可以在服务器 `.env` 设置 `DISABLE_HSTS=1`，避免应用重复下发同名响应头，然后重启服务。

`scripts/deploy.sh` 默认用 `NODE_OPTIONS=--max-old-space-size=1536` 构建；服务器内存较小且构建被 OOM 杀掉时，可在服务器上覆盖 `NODE_OPTIONS` 或增加 swap。

## 4. GitHub Actions 自动部署

工作流：`.github/workflows/deploy.yml`。

- `main` 分支的 `CI` 工作流成功完成后自动触发；
- 也支持在 Actions 页面手动 `workflow_dispatch`；
- 自动触发时部署 CI 验证过的提交（`workflow_run.head_sha`），不会部署未通过检查的代码。

需要在仓库 Secrets 配置：

| Secret | 说明 |
| --- | --- |
| `SERVER_HOST` | 服务器公网 IP 或域名 |
| `SERVER_USER` | SSH 用户，例如 `ubuntu` |
| `SERVER_SSH_KEY` | 部署私钥；对应公钥放到服务器 `~/.ssh/authorized_keys` |
| `SSH_KNOWN_HOSTS` | 服务器 SSH host key，提前固定，避免运行时信任 `ssh-keyscan` 结果 |

`SSH_KNOWN_HOSTS` 可以用下面的命令生成后保存到 Secret：

```bash
ssh-keyscan -H <服务器域名或 IP>
```

工作流通过 SSH 执行 `scripts/deploy.sh`，脚本流程：

1. 检查服务器项目目录没有未提交改动；
2. `git pull --ff-only origin main`；
3. `npm ci`；
4. `npm run db:migrate`；
5. `npm run build`；
6. `sudo -n systemctl restart work-summary`；
7. `curl http://127.0.0.1:3000/login` 做健康检查。

服务器需要满足：

- 仓库在 `main` 分支，工作区干净；
- 部署用户能免密执行 `sudo systemctl restart work-summary`；
- 服务器 `.env` 已配置好，部署脚本不会覆盖它；
- 首次部署前已经能在服务器上手动 `npm run build` 成功。

## 5. 手机使用

- 通过 Nginx/Caddy 配置 HTTPS 后，手机浏览器直接打开域名。
- iPhone Safari：分享 → 添加到主屏幕；Android Chrome：菜单 → 安装应用。
- 语音输入必须 HTTPS。
- 支持的浏览器使用 Web Speech API；Chrome 的语音服务依赖 Google 网络，国内可能失败。
- 安卓微信不支持 Web Speech API，会自动切换为录音转写：录音上传到服务端，再由服务端调用 SiliconFlow。未配置 `REVIEW_ASR_API_KEY` 时提示直接打字。
- 复制按钮需要 HTTPS 或 localhost。

## 6. 公开演示（/demo）

`/demo` 是内置演示页，免登录，使用 `lib/demo-data.ts` 的内存数据，不读写正式数据库，刷新后恢复初始状态。已登录用户默认进入正式工作台；需要查看演示时访问 `/demo?preview=1`。

仓库公开时不要放入真实学生数据；演示页本身不依赖生产数据库。

## 7. 定时推进记忆生命周期（可选）

不配置也能正常工作：生成、提取和记忆页读取前都会惰性推进，只是长时间不访问时状态不会提前变化。需要固定凌晨执行时，在服务器 `.env` 设置 `CRON_SECRET`，然后加一条 crontab：

```bash
0 3 * * * curl -fsS -X POST http://127.0.0.1:3000/api/cron/memories-lifecycle -H "Authorization: Bearer <CRON_SECRET>" > /dev/null
```

把 `<CRON_SECRET>` 换成与服务器 `.env` 相同的值。接口只执行 `syncMemoryLifecycle()` 并返回 `pending` / `archived` 条数；未配置 `CRON_SECRET` 时返回 503，不会暴露写接口。

## 8. 常见部署问题

详细排错见 [faq.md](faq.md)。高频问题：

- **生产环境报「必须配置 DATABASE_URL」**：服务器 `.env` 没配置或没生效；补上 Supabase 连接串后 `sudo systemctl restart work-summary`。
- **`unsupported startup parameter: pgbouncer`**：连接串混入 Prisma 专用参数；删掉 `pgbouncer=true` 和 `connection_limit=1`。应用运行时会自动清理，但迁移脚本和外部工具仍需手动处理。
- **`relation does not exist` / 没有表**：迁移没跑成功，或 `DATABASE_URL` 指向了另一个 Supabase 项目。
- **GitHub Actions 部署失败**：检查四个 Secrets、CI 是否成功、服务器工作区是否干净、`git pull --ff-only` 是否冲突、`npm ci` 和 `npm run build` 是否成功、部署用户是否有免密 `systemctl restart` 权限。
- **Nginx/Caddy 502 或超时**：先 `systemctl status work-summary`，再 `curl http://127.0.0.1:3000/login`；如果本机正常，检查反向代理 upstream 和超时配置。
- **构建被 OOM 杀掉**：`scripts/deploy.sh` 默认 `--max-old-space-size=1536`；小内存服务器可调大或增加 swap。
- **PGlite 初始化失败 / 数据库被锁**：同一时间只能有一个进程打开 PGlite；不要同时开多个 dev server 或在 dev 运行时迁移。生产请用 Supabase/Postgres。
