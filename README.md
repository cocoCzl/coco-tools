# Coco Tools

个人本地工具集合，专注于离线、轻量的数据处理。目前包含一款 Chrome 扩展：**转换工具箱**，在独立标签页中完成常用的数据与时间转换。

## 功能

| 模块 | 支持的操作 |
| --- | --- |
| JSON 格式化 | 校验、格式化、压缩，支持 2 空格、4 空格和 Tab 缩进 |
| JSON 转义 | 字符串转义与反转义，可选非 ASCII 字符转义 |
| URL 参数 | 查询参数与 JSON 互转，支持完整 URL 和重复参数 |
| Java 数据类 | 从 JSON 生成 Java POJO，支持嵌套对象、对象数组、Jackson 和 Lombok |
| JSON / YAML | 双向转换、YAML 格式化与校验，支持 JSON 兼容的 YAML 子集 |
| 时间戳 | Unix 时间戳与日期互转，支持秒、毫秒、本地时区和 UTC |

- **本地处理**：转换无需联网，不上传数据，无远程脚本、字体或统计服务；扩展仅申请 `storage` 权限。
- **保留数字精度**：JSON 格式化、压缩保留数字原文，JSON / YAML 转换避免大整数和高精度小数的精度丢失。
- **独立工作台**：支持文件导入、结果复制与下载、错误定位、键盘快捷键，以及浅色、深色和跟随系统主题。

输入和结果仅保留在当前页面内存中，切换模块可继续使用，刷新或关闭页面即清除；仅保存外观、缩进和 Java 配置等偏好。转换规则与限制见[使用说明](tools/converter-toolbox/README.md)。

## 安装

准备 Node.js **24.11.1 至 24.x**（推荐使用 `.node-version` 指定版本）和 npm 11，在项目根目录执行：

```bash
npm ci
npm run build:converter-toolbox
```

1. 在 Chrome 中打开 `chrome://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择 `tools/converter-toolbox/dist`。
3. 点击扩展图标，打开转换工具箱；再次点击会聚焦已打开的工作台。

需要 ZIP 安装包时，运行 `npm run package:converter-toolbox`，产物位于 `tools/converter-toolbox/release/`。解压后按上述步骤加载解压目录。

## 本地开发

技术栈：TypeScript + Vite + 原生 DOM，文本转换在 Web Worker 中执行。各工具通过 npm workspaces 管理，独立维护版本和构建产物。

```bash
npm run dev:converter-toolbox    # 启动工作台开发服务
npm run test:converter-toolbox   # 运行 Node 测试
npm run check:converter-toolbox  # 格式、测试、打包与性能检查
```

开发服务用于调试工作台页面，完整扩展行为需构建后在 Chrome 中验证。更多命令、浏览器测试和打包说明见[开发指南](docs/development.md)。
