# coco-tools

个人工具集合仓库，用来统一管理自己做的小工具、浏览器扩展和后续可能新增的应用。

## Tools

| Tool | Description | Path |
| --- | --- | --- |
| TSP CVT | Chrome 时间戳转换扩展，支持 10 位/13 位时间戳与日期互转 | `tools/tsp-cvt` |
| JSON 工具箱 | 本地、离线的 Chrome JSON 格式化、转换与 Java 数据类生成工具 | `tools/json-toolbox` |

## Development

安装依赖：

```bash
npm install
```

开发 TSP CVT：

```bash
npm run dev:tsp-cvt
```

构建 TSP CVT：

```bash
npm run build:tsp-cvt
```

Chrome 加载扩展时选择：

```text
tools/tsp-cvt/dist
```

开发 JSON 工具箱：

```bash
npm run dev:json-toolbox
```

测试并构建 JSON 工具箱：

```bash
npm run check:json-toolbox
```

Chrome 加载扩展时选择：

```text
tools/json-toolbox/dist
```

## Structure

```text
coco-tools/
├── tools/
│   ├── tsp-cvt/          # TSP CVT Chrome extension
│   └── json-toolbox/     # JSON Toolbox Chrome extension
├── package.json          # npm workspace root
└── README.md
```
