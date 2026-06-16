# coco-tools

个人工具集合仓库，用来统一管理自己做的小工具、浏览器扩展和后续可能新增的应用。

## Tools

| Tool | Description | Path |
| --- | --- | --- |
| TSP CVT | Chrome 时间戳转换扩展，支持 10 位/13 位时间戳与日期互转 | `tools/tsp-cvt` |

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

## Structure

```text
coco-tools/
├── tools/
│   └── tsp-cvt/          # TSP CVT Chrome extension
├── package.json          # npm workspace root
└── README.md
```
