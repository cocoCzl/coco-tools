# coco-tools

个人工具集合仓库，用来统一管理自己做的小工具、浏览器扩展和后续可能新增的应用。

## Tools

| Tool | Description | Path |
| --- | --- | --- |
| 转换工具箱 | 本地、离线、轻量的 Chrome 数据与时间转换扩展 | `tools/converter-toolbox` |

## Development

安装依赖：

```bash
npm install
```

开发转换工具箱：

```bash
npm run dev:converter-toolbox
```

构建转换工具箱：

```bash
npm run build:converter-toolbox
```

Chrome 加载扩展时选择：

```text
tools/converter-toolbox/dist
```

生成 GitHub Release 安装包并运行完整检查：

```bash
npm run check:converter-toolbox
npm run test:browser -w @coco-tools/converter-toolbox
```

安装包输出为 `tools/converter-toolbox/release/converter-toolbox-v1.0.0.zip`。解压后在 `chrome://extensions` 打开开发者模式，选择“加载已解压的扩展程序”并指向解压目录。升级时在扩展管理页刷新或重新加载新目录；卸载时在同页移除扩展即可，转换输入、输出和历史不会保留。

支持 Windows、macOS、Linux 的桌面版 Google Chrome 当前稳定版。Edge、Brave 等 Chromium 浏览器可尝试安装，但不属于正式支持范围。

## Structure

```text
coco-tools/
├── tools/
│   └── converter-toolbox/ # 转换工具箱 Chrome extension
├── package.json          # npm workspace root
└── README.md
```
