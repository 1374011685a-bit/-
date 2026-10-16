# 部署到 Sealos / Deploy on Sealos

这个游戏是**纯静态站点**：没有后端、没有数据库、不需要环境变量，也不需要持久化存储 —— 访客的进度（星星、皮肤、本机排行榜）存在**各自浏览器的 localStorage** 里，服务器不保存任何东西。所以镜像只有一个 nginx 加约 130KB 文件，多副本也没问题。

先选一条路：

| 你的情况 | 走哪条 | 一步到位的产出 |
| --- | --- | --- |
| 不想装 Docker，只想尽快有个链接 | **0. 单文件版**（见下） | 一个 `block-jump.html`，传到任意静态托管就是网址 |
| 要在 Sealos 上正式跑（自定义域名、HTTPS、可扩副本、能加到手机桌面） | **1+2. 镜像 + 应用启动台** | `https://xxx.sealos.run` |
| 想自己管 K8s 资源 | **3. YAML** | 由你决定的 Ingress 域名 |

## 0. 最快：单文件版（不需要 Docker）

把 CSS、10 个脚本、图标全部内联成一个 HTML：

```bash
node deploy/build-single-file.js      # 产出 dist/block-jump.html（约 135KB）
```

验证过：它**不会发出任何额外请求**（不用联网、没有 css/js/图片子资源），从本地文件直接打开就能玩，在只有这一个文件的静态目录里也能正常跑。所以：

- 传到**任意静态托管**（Netlify / Cloudflare Pages / GitHub Pages / 对象存储的静态站点 / 你自己的服务器）就是一个链接；
- 或者丢进 **Sealos Devbox**，在目录里跑 `python3 -m http.server 80`，把 80 端口对外暴露 —— 完全不用碰 Docker；
- 或者**直接发给朋友**：一个文件，他点开就能玩（不用解压）。

代价：单文件版没有"添加到手机桌面"那种原生感（那需要 manifest 和真实图标文件，也就是下面这套多文件版本）。想做正式站点就用镜像版。

## 推到 GitHub（顺带拿到免费链接和 CI）

这个目录本身就是一个能独立成仓库的项目根目录：`index.html` 在根上，`Dockerfile` 的构建上下文也是它。

```bash
cd <游戏目录>
git init -b main
git add -A
git commit -m "Block Jump: one-button pixel-art jumper"
```

然后在 GitHub 网页上新建一个**空仓库**（别勾 README），把地址接上：

```bash
git remote add origin https://github.com/你的用户名/block-jump.git
git push -u origin main
```

装了 `gh` CLI 的话一条就够：`gh repo create block-jump --public --source=. --push`。

推上去之后有两件白拿的好事：

- **免费链接，不用任何服务器**：仓库 Settings → Pages → Source 选 `main` 和 `/ (root)` 保存，一两分钟后 `https://你的用户名.github.io/block-jump/` 就能玩。HTTPS 已开、手机打开是满屏、也能"添加到主屏幕"（图标和 manifest 都在仓库里）。这是把所有东西分享出去最省事的方式。
- **本机不用装 Docker 也能有镜像**：仓库里带了 `.github/workflows/docker.yml`，push 到 `main`、打 `v*` tag，或在 Actions 页面手动触发，GitHub 的 runner 就会构建镜像并推到 GHCR：`ghcr.io/你的用户名/block-jump:latest`。首次跑完去 Packages 里把那个包设成 **Public**，Sealos 就能直接拉取部署（对私有包需要在 Sealos 里配拉取密钥）。
  - 工作流里镜像名是**写死的字面量**，不要改成 `ghcr.io/${{ github.repository }}`：仓库名如果是纯符号（比如 `-`）或含大写字母，GHCR 会直接拒绝。
  - 工作流会**自动找到 Dockerfile**（根目录、子目录、更深一层都行），不需要手改 `context`。
  - 前提是仓库里得有整套文件：`Dockerfile`、`deploy/nginx.conf`、`index.html`、`css/`、`js/`。网页上传时漏掉 `deploy/` 是最常见的失败原因（构建日志里会写 `deploy/nginx.conf: not found`）。

### 文件用网页上传的（没有走 git push）怎么部署

先用十秒钟看一眼**仓库根目录**：看到的是 `index.html`、`css/`、`js/`，还是只有一个 `block-jump/` 文件夹？两种都能发布，只是网址不同。

**拿到网址（零配置，推荐）**

1. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main`、目录选 `/ (root)`，Save。
2. 仓库必须是 **public** —— 免费账号的 Pages 只对公开仓库生效。
3. 等一两分钟，然后按你的情况访问：
   - 文件在**根目录** → `https://你的用户名.github.io/仓库名/`
   - 文件在**子文件夹**（比如 `block-jump/`） → `https://你的用户名.github.io/仓库名/block-jump/`

这个地址就能直接发人：手机打开是满屏、能"添加到主屏幕"、进度存在各自浏览器里。

**网页上传会踩的两个坑**

- `.github/` 文件夹必须待在**仓库根目录**，GitHub 才会识别里面的 workflow。如果你是把整个 `block-jump` 文件夹拖上去的，workflow 就落在了 `block-jump/.github/` 里 —— 不会自动构建镜像。想在 GitHub 上自动构建，就把 `.github` 移到根目录（网页版可以 Add file → Create new file，路径写 `.github/workflows/docker.yml` 再把内容粘进去）。
- 网页的文件选择器有时不会显示以 `.` 开头的文件/文件夹，`Dockerfile`、`.gitignore`、`.github` 这类要单独确认一下在不在仓库里。

文件在子文件夹里又想走容器部署的话，镜像的构建上下文要指向那个子目录：本地构建用 `.\deploy\build.ps1` 时把 `-Image` 和目录换一下，或在 Sealos/CI 里用 `context: ./block-jump`。最省事的还是把仓库整理成"`index.html` 在根目录"的形态。

## 1. 构建并推送镜像

镜像里已经包含全部内容，构建不需要任何依赖下载（除了基础镜像）。

用 PowerShell（本机已装 Docker 并 `docker login` 过）：

```powershell
cd <游戏目录>
.\deploy\build.ps1 -Image docker.io/你的用户名/block-jump:1.0
```

或者手动两条命令：

```bash
docker build -t docker.io/你的用户名/block-jump:1.0 .
docker push docker.io/你的用户名/block-jump:1.0
```

也可以推到 GHCR：`ghcr.io/你的用户名/block-jump:1.0`。构建时会自动跑 `nginx -t`，配置写错会**在构建阶段就报错**，不会带着坏配置上线。

> 用国内网络推 Docker Hub 慢的话，可以推到任意公开仓库（阿里云 ACR、腾讯云 TCR、Harbor 等），Sealos 只要能从集群拉取即可。

## 2. 在 Sealos 应用启动台创建应用

登录 [sealos.run](https://sealos.run/) → 进入**应用启动台**（App Launchpad）→ **新建应用**，填这几项就够：

| 项目 | 值 |
| --- | --- |
| 镜像 | `docker.io/你的用户名/block-jump:1.0` |
| 容器端口 | `80` |
| 外网访问 | 打开（Sealos 会自动分配域名并签发 HTTPS 证书） |
| CPU / 内存 | 0.1 核 / 128 MB（绰绰有余） |
| 副本数 | 1（想更稳可以 2） |
| 环境变量 / 存储卷 | 不需要，留空 |

点部署，等状态变成 Running，就能拿到形如 `https://xxxx.sealos.run` 的地址。界面用词各版本可能略有差异，但**最少只要两样：镜像地址 + 容器端口 80 且开放外网**。

## 3. 另外两条路（可选）

**Kubernetes YAML：** 想用集群资源面板或 `kubectl` 自己管，就用同目录的 `sealos.yaml`：

```bash
kubectl apply -f deploy/sealos.yaml   # 先把里面的镜像地址和域名改成你自己的
```

里面有 Deployment / Service / Ingress，探针打的是 `/`。如果走这条路，HTTPS 由集群的 cert-manager 签发，把 Ingress 上那行 `cluster-issuer` 注释打开即可。

**Devbox（完全不碰 Docker）：** 在 Sealos 开一个 Devbox，把游戏目录放进去，跑一个静态服务并把端口暴露出去：

```bash
python3 -m http.server 80
```

Devbox 支持对外暴露端口，适合临时给朋友玩；长期用还是镜像更省心（Devbox 关了服务就没了）。

## 4. 上线后要知道的几件事

- **手机直接玩**：有了 HTTPS 地址，微信/短信里发一个链接，朋友点开就能玩 —— 比发压缩包省事得多，手机上也不用解压。竖屏、横屏都是满屏：竖屏自动换用竖着的画面缓冲区（像素更大），横屏看到更远的平台。
- **能加到手机桌面**：站点带了 `manifest.json`、`apple-touch-icon.png` 和 192/512 图标（图标就是那个橙色方块本人），用手机浏览器"添加到主屏幕"后会以全屏方式启动，跟原生小游戏的手感一样。
- **进度是按浏览器存的**：同一个人换浏览器、清缓存、换设备都会重新开始。想让星星和排行榜跟人走，就得加后端账号体系（当前没有任何服务端代码）。
- **没有隐私问题**：没有埋点、没有第三方请求、不联网；除了访客自己浏览器里的 localStorage，服务器不接触任何数据。
- **更新版本**：改完代码用新 tag 重新构建推送（比如 `:1.1`），在 Sealos 里改镜像 tag 即可；nginx 配置对 `index.html` 和 js/css 都做了合理缓存（页面不缓存，静态文件 10 分钟），所以不会出现改了没生效的诡异情况。
- **想更快**：目前文件名没有做内容哈希，所以缓存时间设得保守。哪天想上 CDN 长缓存，把文件名加哈希后把 `deploy/nginx.conf` 里的 `expires 10m` 改成 `expires 1y` 加 `immutable` 就行。
- **离线可玩（还没做）**：加个 service worker 就能缓存全部文件、断网也能玩；现在每次打开都需要联网。
