# TSP CVT

Coco Tools 中的 Chrome 时间戳转换扩展，用于时间戳与日期之间的相互转换。

## 功能特性

- **实时时间戳** - 顶部显示当前毫秒级时间戳，低频实时更新以减少重渲染
- **时间戳转日期** - 自动识别 10 位（秒）或 13 位（毫秒）时间戳
- **日期转时间戳** - 通过日期时间选择器，同时输出 10 位和 13 位时间戳
- **一键复制** - 所有结果都支持点击复制到剪贴板
- **中文支持** - 星期显示为中文

## 技术栈

- React 19
- TypeScript
- Vite 7
- Tailwind CSS
- dayjs

## 安装使用

### 1. 克隆项目

```bash
git clone https://github.com/cocoCzl/coco-tools.git
cd coco-tools
```

### 2. 安装依赖

```bash
npm install
```

### 3. 构建项目

```bash
npm run build:tsp-cvt
```

### 4. 加载到 Chrome

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `tools/tsp-cvt/dist` 目录

## 开发

```bash
# 启动开发服务器
npm run dev:tsp-cvt

# 构建生产版本
npm run build:tsp-cvt

# 预览构建结果
npm run preview:tsp-cvt
```

## 项目结构

```
tsp-cvt/
├── src/
│   └── popup/
│       ├── App.tsx        # 主组件
│       ├── main.tsx       # 入口文件
│       ├── style.css      # 样式文件
│       └── index.html     # HTML 模板
├── public/
│   ├── manifest.json      # Chrome 扩展配置
│   └── icons/             # 扩展图标
├── scripts/               # 构建脚本
├── dist/                  # 构建输出
└── package.json
```

## 截图

![TSP CVT UI](timestamp-converter-ui.jpg)

## License

MIT
