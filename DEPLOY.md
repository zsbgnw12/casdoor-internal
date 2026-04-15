# Casdoor 内部部署手册

本仓库 `casdoor-internal` 是 Casdoor 的内部 fork，用于跑自定义改动并部署到 Azure 容器应用 `casdoor`。

---

## 1. 线上资源一览

| 项目 | 值 |
|---|---|
| GitHub 仓库 | https://github.com/zsbgnw12/casdoor-internal |
| 默认分支 | `master` |
| 容器镜像仓库 | `socsocacr.azurecr.io`（ACR Basic，East Asia 订阅 / RG `AuthData` 同订阅 SEA） |
| 镜像名 | `socsocacr.azurecr.io/casdoor:<YYYYMMDD>-<git短 sha>` + `:latest` |
| Azure 容器应用 | `casdoor` (RG `AuthData`, East Asia) |
| 访问域名 | https://casdoor.ashyglacier-8207efd2.eastasia.azurecontainerapps.io |
| 数据库 | `dataope.postgres.database.azure.com`（Azure PG），连接串注入在 ACA secret `casdoor-pg-dsn` |

---

## 2. CI/CD 工作流

`.github/workflows/build-and-deploy.yml`

**触发**：push 到 `master` / `main` 分支，或在 Actions 页面手动 `Run workflow`。

**执行步骤**：

1. Checkout（全量历史，`fetch-depth: 0`）—— 后端 `TestGetVersionInfo` 要读 git log
2. 生成镜像 tag：`YYYYMMDD-<SHA前7位>`
3. 登录 ACR（用 repo secrets `ACR_USERNAME` / `ACR_PASSWORD`）
4. `docker buildx build --target STANDARD --platform linux/amd64` → push 两个 tag（带日期版 + `latest`）
5. Azure login（用 secret `AZURE_CREDENTIALS` JSON）
6. `az containerapp registry set` 确保容器应用绑定了 ACR 凭据
7. `az containerapp update --image ...` 切到新镜像 —— ACA 会创建新 revision 并在健康后切 100% 流量
8. 打印 revision 列表

**必配的 3 个 Repository Secrets**（Settings → Secrets and variables → Actions）：

| Secret | 作用 |
|---|---|
| `ACR_USERNAME` | `socsocacr` |
| `ACR_PASSWORD` | ACR admin 密码（`az acr credential show -n socsocacr`） |
| `AZURE_CREDENTIALS` | Service Principal JSON（`casdoor-gha-deploy`，Contributor 作用域 `/subscriptions/.../resourceGroups/AuthData`） |

> SP 已通过 `az ad sp create-for-rbac` 创建。若需轮换凭据，重新跑一次 `az ad sp create-for-rbac --name "casdoor-gha-deploy" --role Contributor --scopes "/subscriptions/45d7a360-af09-40fc-9afc-56dc475245ec/resourceGroups/AuthData" --json-auth`，替换 secret。

---

## 3. 日常开发 → 部署流程

**工作目录**：`C:/Users/陈晨/Desktop/工单相关/casdoor-internal/`（本仓库）

```bash
# 1. 同步最新代码
git pull

# 2. 做改动（前端在 web/src/，后端在 controllers/ / object/ / routers/ 等）

# 3. 提交并推送
git add <改动文件>
git commit -m "feat: xxx"
git push

# 4. 等 GitHub Actions 跑完（约 6–10 分钟）
#    打开 https://github.com/zsbgnw12/casdoor-internal/actions 看进度

# 5. 跑完后验证
curl -I https://casdoor.ashyglacier-8207efd2.eastasia.azurecontainerapps.io/
az containerapp revision list -n casdoor -g AuthData -o table
```

**回滚**：在 GitHub Actions 重新跑某个历史 commit 对应的 workflow，或手动：

```bash
az containerapp update -n casdoor -g AuthData --image casbin/casdoor:latest
# 或用 ACR 历史 tag
az containerapp update -n casdoor -g AuthData --image socsocacr.azurecr.io/casdoor:<旧日期-sha>
```

---

## 4. 本次迭代做了什么

**业务目标**：登录页背景改用必应每日壁纸，每日更新，叠 45% 黑遮罩保证表单可读，保留原 `formBackgroundUrl` 自定义优先。

### 4.1 后端改动

| 文件 | 改动 |
|---|---|
| `controllers/bing.go` | **新增**：`BingBackground()` 控制器，6h 内存缓存 + 5s HTTP 超时 + 兜底图 |
| `routers/router.go` | 注册路由 `GET /api/public/bing-background` |
| `authz/authz.go` | Casbin 策略加一行白名单，允许匿名访问 `/api/public/bing-background` |
| `object/application.go` | `Application` 结构体加字段 `UseBingBackground bool` —— xorm 启动时自动 `ALTER TABLE` |

**新接口**：`GET /api/public/bing-background`  
响应：
```json
{
  "imageUrl": "https://www.bing.com/th?id=OHR.xxx.jpg",
  "title": "必应当日图片版权信息",
  "fetchedAt": 1776270161
}
```
- 上游：`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN`
- 失败走兜底图（常量 `bingFallback`）
- 进程内 `sync.RWMutex` + 6h TTL，无 Redis 依赖

### 4.2 前端改动

| 文件 | 改动 |
|---|---|
| `web/src/App.less` | `.loginBackground` / `.loginBackgroundDark`：`cover` 铺满 + `::before` 45%/35% 黑遮罩 + `#f0f2f5` 灰底降级 |
| `web/src/EntryPage.js` | state 加 `bingBgUrl`；`componentDidUpdate` + `maybeFetchBing` 按规则拉图；`resolveBgUrl` 决策 URL；render 用 `this.resolveBgUrl()` |
| `web/src/ApplicationEditPage.js` | 在「Background URL Mobile」下方加 `Use Bing daily wallpaper` 开关（Switch） |
| `web/src/locales/en/data.json` | 新增英文文案 `Use Bing daily wallpaper` + Tooltip |
| `web/src/locales/zh/data.json` | 新增中文文案「使用必应每日壁纸」+ Tooltip |

**前端决策优先级**（`EntryPage.resolveBgUrl`）：

1. iframe 模式 → 不设背景（保留 OAuth 弹窗体验）
2. `application.formBackgroundUrl(Mobile)` 非空 → 用自定义 URL
3. `application.useBingBackground === true` → 调 `/api/public/bing-background` 用返回 `imageUrl`
4. 其它 → 不设 `backgroundImage`，CSS 落到 `#f0f2f5` 灰底降级

### 4.3 构建/CI 改动

| 文件 | 改动 | 理由 |
|---|---|---|
| `Dockerfile` | 删 `RUN sed -i 's/https/http/' /etc/apk/repositories` | 现代 Alpine HTTPS 必需 |
| `Dockerfile` | `RUN ./build.sh` → `RUN sh ./build.sh` | 避免 Windows 丢 +x 位导致 exit 126 |
| `Dockerfile` | `yarn run build` 前加 `CI=false` | 让 react-scripts 的 warning 不被当 error |
| `.dockerignore` | 新增排除 `web/build/ .github/ logs/ ...`；**保留** `.git/` | `.git/` 被 `TestGetVersionInfo` 需要 |
| `.gitignore` | 新增 `pass.txt 登录设计建议.txt 登录页必应背景方案.md` | 本地笔记和密钥不进仓库 |
| `.github/workflows/build-and-deploy.yml` | **新增** | GHA 构建 + 部署 workflow |

### 4.4 本地不进仓库的文件

- `conf/app.conf` —— 含本地 PG DSN，已 `git update-index --skip-worktree`
- `docker-compose.yml` —— 本地 dev 改动，同上
- `pass.txt` —— 数据库密码备忘，已 gitignore

---

## 5. 常见故障定位

| 症状 | 原因 / 修复 |
|---|---|
| Actions `go test` 挂 | `.dockerignore` 误排除 `.git/`；恢复 |
| Actions `./build.sh` exit 126 | 改 `sh ./build.sh` |
| Actions yarn `Failed to compile` + `curly` / `no-unused-vars` | `CI=false` 已缓解；若想彻底：修 eslint 报错（看日志顶部行号）或在 Dockerfile 前端 step 加 `DISABLE_ESLINT_PLUGIN=true` |
| ACA 新 revision Unhealthy | `az containerapp logs show -n casdoor -g AuthData --container casdoor --tail 200` |
| ACR push 403 | Secret 里 `ACR_PASSWORD` 失效，用 `az acr credential show -n socsocacr` 取新的 |
| `az login` in workflow 失败 | SP 过期或被删；重跑 `az ad sp create-for-rbac ...` 更新 `AZURE_CREDENTIALS` secret |
| DB 连接错误 | ACA secret `casdoor-pg-dsn` 被动过；`az containerapp secret list / set` 核对 |

---

## 6. 上游同步

本仓库从 `github.com/casdoor/casdoor` fork 而来。追上游最新变更：

```bash
git remote add upstream https://github.com/casdoor/casdoor.git   # 首次
git fetch upstream
git merge upstream/master   # 或 rebase
# 解决冲突后
git push
```

> 注意：上游可能改 `Dockerfile`，合并后要手动把 `sh ./build.sh`、`CI=false` 这两处修复保留。

---

## 7. 快速命令参考

```bash
# 查当前容器应用状态
az containerapp show -n casdoor -g AuthData --query "{image:properties.template.containers[0].image, revision:properties.latestRevisionName, running:properties.runningStatus}" -o json

# 查 revisions
az containerapp revision list -n casdoor -g AuthData -o table

# 查实时日志
az containerapp logs show -n casdoor -g AuthData --container casdoor --tail 200 --follow

# 手动切镜像（跳过 GHA）
az containerapp update -n casdoor -g AuthData --image socsocacr.azurecr.io/casdoor:<tag>

# 列出 ACR 里所有 casdoor tag
az acr repository show-tags -n socsocacr --repository casdoor -o table

# 测必应接口
curl -s https://casdoor.ashyglacier-8207efd2.eastasia.azurecontainerapps.io/api/public/bing-background | jq
```
