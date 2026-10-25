# coco-tools

个人本地工具集合仓库。每个 `tools/*` 是独立 npm workspace，保留独立版本、构建目录和安装包。目前仅有 [转换工具箱](tools/converter-toolbox/README.md)，不建立空的共享包。

转换工具箱是本地、离线、轻量的 Chrome 扩展，包含 JSON 格式化、JSON 转义、URL 参数、Java 数据类、JSON / YAML 和时间戳六个模块。转换全部在本机执行，不上传数据，不使用远程脚本、字体或统计服务。

## 开发与验证

使用 Node **24.11.1**（见 `.node-version`；支持 24.11.1 至 24.x）、npm 11。Java 编译测试使用 JDK 21；本地没有 JDK 时会明确跳过，CI 缺少 JDK 则失败。

```bash
npm ci
npm run dev:converter-toolbox
```

从仓库根目录执行：

| 命令 | 职责 |
| --- | --- |
| `npm run dev:converter-toolbox` | 准备图标并启动 Vite 开发服务；扩展完整验收使用构建目录 |
| `npm run prepare:assets -w @coco-tools/converter-toolbox` | 生成本地图标，无网络依赖 |
| `npm run typecheck -w @coco-tools/converter-toolbox` | TypeScript 类型检查 |
| `npm run test:converter-toolbox` | 自动准备图标，执行核心、发布约束、Service Worker、Java 编译和时间戳 Node 测试 |
| `npm run test:java:annotations -w @coco-tools/converter-toolbox` | 使用指定的真实 Lombok/Jackson JAR 编译及反射验证生成代码（配置见下文） |
| `npm run build:converter-toolbox` | 准备资源、类型检查、构建和产物审计；**不生成 ZIP** |
| `npm run package:converter-toolbox` | 构建、生成 ZIP、解压检查全部文件内容和版本 |
| `npm run benchmark -w @coco-tools/converter-toolbox` | 独立性能检查，不依赖构建 |
| `npm run check:converter-toolbox` | 格式检查、Node 测试、构建、打包验证和性能检查 |
| `npm run test:browser -w @coco-tools/converter-toolbox` | 构建并在实际加载 MV3 的 Chrome for Testing 中执行浏览器回归 |
| `npm run format -w @coco-tools/converter-toolbox` | 用 Prettier 格式化源码、脚本和测试 |

首次浏览器测试先安装匹配锁定 Playwright 版本的 Chromium：

```bash
npx --no-install playwright install --with-deps chromium
npm run test:browser -w @coco-tools/converter-toolbox
```

浏览器测试使用有界面的 Chromium 和临时 profile，不使用不能加载扩展的 headless shell。Linux 无图形桌面时使用 `xvfb-run -a npm run test:browser -w @coco-tools/converter-toolbox`；可用 `CHROME_EXECUTABLE` 指定兼容 Chromium 二进制。GitHub Actions 从干净检出开始 `npm ci`，安装 JDK/Chromium，执行上述检查，上传安装包；不会创建 Release、推送或发布商店版本。

真实注解处理器测试要求 JDK 21，并将 `LOMBOK_JAR`、`JACKSON_ANNOTATIONS_JAR` 环境变量分别指向 **Lombok 1.18.38**、**Jackson annotations 2.19.2** 的 JAR。测试校验固定 SHA-256，再显式启用 Lombok 注解处理器，验证 Lombok 单独开启及与 Jackson 同时开启的字段类型、访问器和字段映射。已有 JAR 时可离线执行；普通 Node 测试不下载 JAR。CI 在独立步骤从 Maven Central 下载固定版本，下载失败或校验不符会失败；JAR 不进入扩展包。

## 安装、版本与目录

在 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，指向 `tools/converter-toolbox/dist`。也可运行打包命令后解压 `tools/converter-toolbox/release/converter-toolbox-v<version>.zip`，直接加载解压根目录。

版本源是扩展自己的 `tools/converter-toolbox/package.json`。升级版本时运行：

```bash
npm version patch -w @coco-tools/converter-toolbox --no-git-tag-version
```

npm 的 `version` 生命周期同步源码 Manifest；构建与打包会检查 package.json、源码 Manifest、构建 Manifest、ZIP 内 Manifest 一致。根 package.json 的版本不控制扩展版本。ZIP 由开发依赖 `fflate` 在 Node 中生成，不依赖系统 `zip`；普通构建与发布打包已拆开。原 `check:converter-toolbox` 仍包含打包。

支持桌面版 Chrome；其他 Chromium 浏览器可尝试使用。

```text
coco-tools/
├── tools/converter-toolbox/   # 独立扩展、版本和发布脚本
├── .github/workflows/        # 测试和构建，不自动发布
├── CONTEXT.md                # 产品术语及数据边界
└── package.json              # npm workspaces 入口
```
