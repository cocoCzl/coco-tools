# 开发指南

所有命令均在仓库根目录执行。使用 Node.js **24.11.1 至 24.x**（`.node-version` 固定为 24.11.1）和 npm 11，首次运行先执行 `npm ci`。Java 编译验证使用 JDK 21。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev:converter-toolbox` | 生成图标并启动 Vite 开发服务 |
| `npm run test:converter-toolbox` | 生成图标，运行转换、时间戳、Service Worker、发布约束及 Java 编译测试 |
| `npm run build:converter-toolbox` | 生成资源、类型检查、构建并审计产物，不生成 ZIP |
| `npm run package:converter-toolbox` | 构建、生成 ZIP 并校验完整内容和版本 |
| `npm run check:converter-toolbox` | 格式检查、Node 测试、打包验证和性能检查 |
| `npm run typecheck -w @coco-tools/converter-toolbox` | TypeScript 类型检查，包含未使用变量与参数检查 |
| `npm run format -w @coco-tools/converter-toolbox` | 格式化源码、脚本和测试；只检查时使用 `format:check` |
| `npm run benchmark -w @coco-tools/converter-toolbox` | 独立运行性能检查，无需先构建 |
| `npm run test:browser -w @coco-tools/converter-toolbox` | 构建并运行真实扩展浏览器回归 |
| `npm run test:java:annotations -w @coco-tools/converter-toolbox` | 使用真实 Lombok / Jackson JAR 验证生成代码 |

`check:converter-toolbox` 不包含浏览器回归和真实注解处理器测试，两者需单独执行。

## 浏览器测试

首次使用需安装与锁定 Playwright 版本匹配的 Chromium：

```bash
npx --no-install playwright install --with-deps chromium
npm run test:browser -w @coco-tools/converter-toolbox
```

测试使用有界面的 Chromium 和临时 profile，实际加载 Manifest V3 扩展。Linux 无图形桌面时执行：

```bash
xvfb-run -a npm run test:browser -w @coco-tools/converter-toolbox
```

可通过 `CHROME_EXECUTABLE` 指定兼容的 Chromium 二进制。Vite 开发服务只用于工作台页面调试，完整扩展验证使用构建目录。

## Java 编译验证

普通 Node 测试通过 `javac` 编译生成代码，并用反射核实字段类型。本地缺少 JDK 时会明确跳过；CI 缺少 JDK 则失败。

真实注解处理器测试要求 JDK 21，并配置以下环境变量：

| 环境变量 | 对应文件 |
| --- | --- |
| `LOMBOK_JAR` | Lombok **1.18.38** JAR 的路径 |
| `JACKSON_ANNOTATIONS_JAR` | Jackson annotations **2.19.2** JAR 的路径 |

测试校验固定 SHA-256，显式启用 Lombok 注解处理器，验证 Lombok 单独开启及结合 Jackson 时的字段类型、访问器和映射。已有 JAR 时可离线执行，普通 Node 测试不会下载 JAR。

## 性能检查

对 JSON 格式化、Java 生成、YAML → JSON 和 JSON → YAML 分别测量 1 / 10 / 20 MB 输入。每项使用新的 Node 子进程，不预热、不重试：

| 输入规模 | 单次转换时间预算 | 转换返回时的增量堆预算 |
| --- | --- | --- |
| 1 MB | ≤ 200 ms | ≤ 200 MiB |
| 10 / 20 MB | ≤ 2,000 ms | ≤ 200 MiB |

输出包含硬件、实际输入与输出字节数，以及全部失败项。增量堆不代表峰值或浏览器进程内存，Node 核心转换时间也不代表页面端到端耗时。

预算以单次用户操作为单位；旧的四步组合仍运行，但仅用于历史诊断，不参与通过判定。这与旧组合总耗时口径不同，不能据此宣称同口径提速。检查不按机器性能自动放宽预算。

## 版本与安装包

各 `tools/*` 工具独立维护版本。转换工具箱的版本源为其 `package.json`，升级示例：

```bash
npm version patch -w @coco-tools/converter-toolbox --no-git-tag-version
npm run package:converter-toolbox
```

`version` 生命周期自动同步源码 Manifest；构建与打包检查源码、构建产物和 ZIP 中的 Manifest 版本一致。根 `package.json` 的版本不控制扩展版本。

安装包输出为 `tools/converter-toolbox/release/converter-toolbox-v<version>.zip`，内部直接包含 `dist` 的完整内容，解压根目录即可加载。ZIP 由开发依赖 `fflate` 生成，无需系统 `zip`；构建目录与 ZIP 均检查不超过 1 MiB。

GitHub Actions 执行格式、类型、Node、Java 注解、浏览器及性能检查，并上传 ZIP 构建产物。CI 从 Maven Central 下载上述固定版本 JAR，下载或校验失败会使检查失败；JAR 不进入扩展包。工作流不会创建 GitHub Release 或发布到扩展商店。

## 源码结构

```text
tools/converter-toolbox/
├── src/core/               # 转换逻辑、解析器、数字精度和处理边界
├── src/workbench/          # 界面、模块会话、偏好与交互
├── src/operation-worker.ts # 文本转换 Worker 入口
├── src/service-worker.ts   # 打开或聚焦工作台标签页
├── public/                 # Manifest 与图标资源
├── scripts/                # 资源生成、构建审计、打包与性能检查
└── tests/                  # Node、Java 编译与浏览器回归
```

工作台中，`state.ts` 管理模块临时数据，`worker-client.ts` 管理任务完成、取消与释放，`text-tool.ts` 负责文本交互，`timestamp-tool.ts` 负责日期表单与时钟，`preferences.ts` 管理偏好，`main.ts` 负责导航与外观。

产品术语与数据边界见 [CONTEXT.md](../CONTEXT.md)，使用规则见[转换工具箱说明](../tools/converter-toolbox/README.md)。
