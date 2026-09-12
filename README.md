# Sun-Panel 安卓客户端

Sun-Panel（https://github.com/hslr-s/sun-panel）的轻量安卓 App。打开后填入面板地址 + 账号密码，即可浏览导航卡片，点击后在应用内浏览器打开你的各个 Docker 服务。

> 这不是官方客户端。项目为个人自用性质，遵循上游 MIT 协议。

## 特性

- **地址 + 账号密码登录**，支持同时保存外网地址与内网地址
- **内外网自动切换**：填了内网地址后，回到家自动优先走内网（启动时探测，也可手动切换）
- **应用内打开服务**：使用 Chrome Custom Tabs，与系统 Chrome 共享 Cookie，各服务登录态复用，返回键直接回到导航列表
- 分组 + 卡片网格、搜索过滤、下拉刷新、本地缓存（断网也能看到上次的数据）
- 长按卡片：分别打开内网 / 外网地址、复制地址
- 支持三种图标类型：文字、自定义图片、Iconify 在线图标
- 壁纸与标题跟随面板个人化设置

## 工作原理

| 环节 | 做法 |
|---|---|
| 请求 | 原生环境用 `CapacitorHttp`（走 OkHttp），**不受浏览器 CORS 限制**，因此不需要改 sun-panel 后端 |
| 鉴权 | `POST /api/login` 取 token，之后请求头带 `token` |
| 打开服务 | `Browser.open()` → Chrome Custom Tabs |

用到的接口只有三个：

```
POST /api/login                            {username, password}
POST /api/panel/itemIconGroup/getList      获取分组
POST /api/panel/itemIcon/getListByGroupId  {itemIconGroupId} 获取卡片
POST /api/panel/userConfig/get             面板个性化配置（壁纸/标题）
```

## 安装

到 Releases 下载 `sunpanel-mobile.apk`，传到手机安装即可。首次打开需要允许「安装未知应用」。

> APK 是 debug 签名，未上架应用商店，仅自用。

## 使用

1. 打开 App，填 **面板地址**（外网，如 `https://panel.yourdomain.com`）
2. **内网地址**选填（如 `http://192.168.1.10:3002`），填了之后在家自动走内网
3. 填 sun-panel 的账号密码，登录
4. 点卡片 → 应用内打开目标服务；返回键回到导航列表

右上角图标：网络环境切换、刷新、服务器设置、退出登录。

## 自行构建

本地不需要 Android SDK —— 推到 GitHub 后由 Actions 自动构建。

```bash
npm install
npm run build          # 生成 dist/
```

构建 APK 的流水线在 `.github/workflows/build-apk.yml`，推送到 `main` 会构建并上传产物；打 `v*` tag 会额外发布 Release。

如果想在本地用 Android Studio 打开：

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

## 已知问题

- sun-panel 的 token 存在服务端内存缓存中，**服务端重启后 App 需要重新登录**（上游既有行为）
- 内网 http 地址依赖 Manifest 中的 `usesCleartextTraffic`（CI 已注入）；若自行构建遇到 http 打不开，检查该配置
- 卡片里若配置的是纯内网地址，在外网环境下点开会失败，属预期（这时用卡片的外网地址）
- Iconify 在线图标需要访问外网

## 技术栈

Vue 无、框架无 —— 原生 JS + Vite 构建，Capacitor 6 打包。
