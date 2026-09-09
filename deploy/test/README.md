# 测试环境一键部署

首次准备配置，之后运行一条命令部署当前工作目录的代码（包括未提交且未被 Git 忽略的文件）：

```bash
cp deploy/test/env.example .env.test.local
# 编辑 .env.test.local，填写测试环境配置
npm run deploy:test -- --check
npm run deploy:test
```

默认使用 SSH 别名 `cd`，发布到 `/home/deploy/aural-test`，Compose 项目名为 `aural-test`，入口仅监听服务器 `127.0.0.1:13001`。需要本机 Python 3、Git、SSH/SCP，本机 Docker（支持 linux/amd64 构建），以及服务器 Docker、Compose 2.30+、flock。本机需要下载 npm 依赖和构建镜像；服务器只加载镜像并运行服务。

## 首次配置

- 准备独立测试 Supabase 项目，按主 README 的 Supabase 初始化说明应用 `supabase/migrations`，配置 Auth 和 Storage。脚本不会初始化、迁移或重置数据库。
- 将测试 Supabase URL、anon key、service role key 填入 `.env.test.local`。不要使用本机 `localhost:54321`：容器中的 localhost 指向容器自身。
- 填入 DeepSeek、DashScope ASR 和 TokenDance TTS 凭据；模板中的模型与现有接入一致。配置值使用不带引号的 `KEY=value` 格式。
- 将 `NEXT_PUBLIC_APP_URL` 设置为实际 HTTPS 域名，并在 Supabase Auth 中配置对应 Site URL / Redirect URLs。
- 两个 `NEXT_PUBLIC_*RELAY_URL` 保持为空，网页通过同域 `/ws/voice` 连接语音服务。本部署不启动 Azure 备用中继。

`.env.test.local` 被 Git 和镜像构建上下文忽略；上传后的 `app.env` 权限为 600。构建通过 BuildKit secret 注入配置。`NEXT_PUBLIC_*` 会进入浏览器包，因此这里只能放公开配置，不能放服务端密钥。更换这些配置需要重新部署。

## HTTPS 入口

现有 `debug.lingjing.energylt.com` 使用 CDN HTTPS 回源 Nginx HTTP。可以复用这种方式，为 Aural 新建独立子域名，配置 DNS、CDN 证书与回源。当前项目不支持直接挂 `/aural` 子路径：接口、分享链接及部分跳转使用根路径。

在独立域名的 Nginx server 中配置如下代理（域名仅为示例）。这不会由部署脚本自动安装：

```nginx
server {
    listen 80;
    server_name aural.lingjing.energylt.com;
    client_max_body_size 100m;
    location / {
        proxy_pass http://127.0.0.1:13001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # 仅适用于 CDN 的 HTTPS 入口回源；直连则需自行配置 TLS。
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 7200s;
        proxy_send_timeout 7200s;
    }
}
```

CDN 需要开启 WebSocket、关闭动态页面/API 缓存，并检查连接超时限制。浏览器麦克风要求 HTTPS。Nginx 超时设为两小时不代表 CDN 也允许两小时连接，也不保证上游语音服务不断线。

## 发布和排障

部署会校验配置，在本机构建镜像，上传镜像、代码和独立环境文件，再启动网页、语音中继和 Nginx 网关。构建失败不替换正在运行的服务；启动健康检查失败会尝试恢复上一版本。发布会重建容器，正在进行的面试连接可能中断，请在无人面试时操作。

`--check` 只检查配置格式、SSH 和 Docker 可用性，不验证第三方凭据、数据库 schema、DNS 或 HTTPS。容器健康检查确认网页与 WebSocket 可连接；完整体验仍需实际完成一次面试。

查看运行状态和日志：

```bash
ssh cd 'cd /home/deploy/aural-test/current && docker compose -p aural-test --env-file compose.env ps'
ssh cd 'cd /home/deploy/aural-test/current && docker compose -p aural-test --env-file compose.env logs --tail=100 web voice'
```

自定义目标（Compose 项目名仍固定为 `aural-test`，不要用于同机部署多个实例）：

```bash
AURAL_DEPLOY_HOST=cd AURAL_DEPLOY_DIR=/home/deploy/aural-test AURAL_HTTP_PORT=13001 AURAL_DEPLOY_ENV=.env.test.local npm run deploy:test
```

历史发布目录与镜像保留用于回退，也包含旧配置密钥。定期人工清理不再需要的版本；不要删除 `current` 指向的版本或运行中的镜像。

## 当前已配置的 IP 测试环境

访问入口为 `https://47.108.226.96`，宿主机配置见 `ip-nginx.conf`。使用仅匹配此 IP 的 Nginx 虚拟主机、自签名 TLS 证书和密码入口；首次浏览器访问需信任证书。入口密码保存在本机 `.env.test.local` 的 `TEST_ACCESS_PASSWORD`，不写入 Git。

本期版本中，密码校验后签发一天有效的 HttpOnly/Secure 访问 Cookie，再进入手机号登录页。网页、API、Supabase 和 WebSocket 均经过入口校验；入口有请求频率限制。手机号可以任意填写，验证码固定为 `123456`。同一手机号对应同一账号，不同手机号拥有独立账号。此功能仅在显式设置 `TEST_ACCESS_ENABLED=true` 时开启，不应用于正式生产环境。

Supabase 已独立部署，说明见 [supabase/README.md](supabase/README.md)。服务端与浏览器均使用 HTTPS `/supabase`，确保录音签名链接能在浏览器访问。容器通过挂载 IP 证书并设置 `NODE_EXTRA_CA_CERTS` 信任该证书。宿主 Nginx 仅允许本机和 Aural 的两个 Docker 子网绕过外层密码门禁，Supabase JWT/RLS 校验仍保留；若重建网络改变网段，需要同步更新 `ip-nginx.conf`。部署 Compose 需要预先存在 `aural-supabase` 网络。构建使用 Node 22、Webpack 与两路并发，在本机生成 linux/amd64 镜像，避免共享服务器构建时内存不足。

修改入口密码后重新运行部署命令。若还要使旧访问 Cookie 立即失效，同时更换 `TEST_ACCESS_SECRET`。应用发布不会重置 Supabase 数据库，也不会自动执行后续数据库迁移。

发布本期功能前，先在目标数据库执行 `supabase/migrations/006_phone_roles_resume.sql`，配置 `MOCK_PHONE_AUTH_ENABLED=true` 和至少 32 字符的 `MOCK_PHONE_AUTH_SECRET`（创建账号后需保持稳定），并同步 `ip-nginx.conf`，移除旧的 `/login` 强制跳转。然后运行部署命令。2026-09-09 已完成以上步骤并发布到 IP 测试环境，详见 [STATUS.md](STATUS.md)。管理员手机号为 `13800138000`，验证码为 `123456`，保留原测试账号及历史数据。
