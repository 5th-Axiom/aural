# 独立测试 Supabase

此配置按 Supabase 官方 Docker 配置裁剪，保留 Postgres、GoTrue、PostgREST、Storage 与内部 Nginx API 网关。镜像固定版本，使用镜像站以适应服务器网络。数据库初始化 SQL 来源：
https://github.com/supabase/supabase/tree/master/docker/volumes/db

服务端安装目录 `/home/deploy/aural-test/supabase`，Compose 项目 `aural-supabase`。`.env` 保存在服务器，含新生成的数据库密码和 JWT 密钥。只在本机环回接口开放 API 端口 15421；Postgres 不映射宿主机端口。

已按顺序执行项目 `supabase/migrations/001` 至 `006`。原共享测试账号已绑定手机号 `13800138000`，账号 ID 与历史数据保留。迁移不是全部幂等，不要重复执行已有迁移。后续新增迁移应先备份再单独执行。

```bash
ssh cd 'cd /home/deploy/aural-test/supabase && docker compose -p aural-supabase ps'
```

数据库、Storage 文件使用 Docker 命名卷。不要执行 `docker compose down -v`，否则删除数据。没有部署 Studio、Realtime、邮件服务、图片变换服务；应用的实时语音使用单独的 voice relay。公开邮箱注册关闭；应用通过服务端 Auth Admin API 创建已验证的模拟手机号账号，验证码为 `123456`。邮件验证码/找回密码不可用。
