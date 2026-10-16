# 部署信息一览 · Block Jump 方块跳跳

**製作：莫大英语第一小组**（Московский государственный университет · Английская группа № 1）

一页纸，手边放着照着填就行。

## 一、仓库与镜像

| 项目 | 值 |
| --- | --- |
| 代码仓库 | https://github.com/1374011685a-bit/- |
| 自动构建 | `.github/workflows/docker.yml`（推送到 `main`、打 `v*` 标签，或在 Actions 页面手动 Run workflow） |
| 镜像地址 | `ghcr.io/1374011685a-bit/block-jump:latest` |
| 固定版本 tag | `ghcr.io/1374011685a-bit/block-jump:sha-xxxxxxx`（在这次 Actions 运行摘要里复制） |
| 镜像内容 | `nginx:1.27-alpine` + 约 140KB 静态文件，无后端、无数据库 |
| 必须做的一步 | GitHub → 你的 Packages → `block-jump` → **Package settings → Change visibility → Public**，否则 Sealos 拉不动 |

## 二、Sealos 应用启动台要填的字段

| 字段 | 填什么 |
| --- | --- |
| 镜像 | `ghcr.io/1374011685a-bit/block-jump:latest` |
| 容器端口 | `80` |
| 外网访问 | 打开（Sealos 自动分配域名并签 HTTPS 证书） |
| CPU / 内存 | `0.1` 核 / `128 MB` |
| 副本数 | `1`（无状态，多开也没问题） |
| 环境变量 | 留空 |
| 存储卷 | 留空 |
| 健康检查路径 | `/`（可选） |

## 三、容器内部约定（排查时用得到）

- 监听端口 **80**（`Dockerfile` 里 `EXPOSE 80`，nginx 配置 `listen 80`）
- 站点根目录 `/usr/share/nginx/html`
- 缓存策略：`index.html` 不缓存；`js/css/json/图片` 缓存 10 分钟；未知路径回落到 `index.html`
- 构建时自动执行 `nginx -t`：配置写错会在**构建阶段**失败，不会带到线上
- 需要自己管 K8s 资源时用 `deploy/sealos.yaml`（探针打 `/`，requests 10m/32Mi，limits 300m/128Mi，Ingress class `nginx`）

## 四、拿到"能发给别人"的链接

| 方式 | 需要的 | 地址 |
| --- | --- | --- |
| GitHub Pages | 仓库 Settings → Pages → `main` + `/ (root)` → Save，仓库需为 public | `https://1374011685a-bit.github.io/-/`（文件在子目录则是 `…/-/block-jump/`） |
| Sealos | 上面的镜像 + 端口 80 | `https://<Sealos 分配的域名>` |

两种都不需要本机装 Docker。

## 五、更新版本（改完代码怎么重新上线）

1. 本地推代码：

   ```powershell
   cd C:\Users\Administrator\Documents\Codex\2026-10-15\ba\outputs\block-jump
   git add -A
   git commit -m "描述这次改了什么"
   git push
   ```

   （首次同步远程时用：`git fetch origin` → `git reset --mixed origin/main` → `git add -A` → `git commit` → `git push -u origin main`）

2. 等 **Actions** 里 `docker` 跑绿（2～4 分钟），复制这次生成的 `sha-xxxxxxx`。
3. **Sealos → 应用 → 编辑 → 把镜像里的 tag 换成新的 `sha-xxxxxxx` → 保存/重新部署。**
   （只点"重启"不够：`latest` 名字没变，节点可能不重新拉镜像。）
4. 验证：手机竖屏应是满屏；刷新后星星/皮肤还在（进度存在各自浏览器里）。

## 六、这台机器的情况（Windows）

| 项目 | 值 |
| --- | --- |
| 项目目录 | `C:\Users\Administrator\Documents\Codex\2026-10-15\ba\outputs\block-jump` |
| 单文件版 | `node deploy/build-single-file.js` → `dist/block-jump.html`（约 138KB，一个文件就是整站，无任何外部请求） |
| 本地构建镜像 | `.\deploy\build.ps1 -Image <你的仓库>/block-jump:1.0`（需要可用的 Docker） |
| Docker 现状 | Docker Desktop 已安装，但 WSL2 缺虚拟磁盘组件（`ERROR_VIRTDISK_PROVIDER_NOT_FOUND`），引擎起不来 → **所以走 GitHub Actions 构建** |
| git 身份 | `hjj <1374011685a@gmail.com>`（全局配置）；已为本项目加过 `safe.directory` 例外 |

## 七、验证命令（都不需要 Docker）

```bash
node tests/deploy-check.js   # 62 项部署文件自检（COPY 路径、页面引用、YAML、nginx、工作流）
node tests/http-smoke.js     # 按容器方式托管并用真实浏览器验证（含刷新后进度保留）
node tests/single-file.js    # 单文件版自检（含"零外部请求"）
node tests/browser.js        # 端到端 18 项（含竖屏/横屏手机、护盾、结算、排行榜）
node tests/sim.js            # 核心玩法：关卡可解性 + AI 用真实物理通关
```

## 八、常见故障对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Actions 报 `deploy/nginx.conf: not found` | 仓库里缺 `deploy/` 文件夹 | 把整个 `deploy` 目录传上去再重跑 |
| Actions 报 `找不到 Dockerfile` | 上传时漏了 `Dockerfile` | 补传后重跑 |
| Sealos 一直 ImagePullBackOff | 包不是 Public | Packages → `block-jump` → visibility 改 Public |
| 打开还是旧版本 | 镜像 tag 没换 | 用新的 `sha-xxxxxxx` 重新部署 |
| 手机仍是横条、上下黑边 | 跑的还是旧镜像/旧文件 | 确认 pod 用的 tag，或 Pages 是否已更新 |
| 本机 `docker` 报 API 连不上 | Docker Desktop 引擎没起来（WSL2 组件缺失） | 见上表"Docker 现状"，不必本机构建，用 Actions 即可 |
