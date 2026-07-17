# JSON 工具箱

本地、离线、轻量的 Chrome JSON 开发工具。点击扩展图标后会打开独立工作台，所有内容只在浏览器本地处理。

## 功能

- 严格、无损的 JSON 格式化、校验与压缩
- 完整 JSON 字符串转义与反转义
- JSON 与标准 URL 查询参数互转
- JSON 生成 Java 8+ 数据类，支持 Jackson 与可选 Lombok
- UTF-8 文件导入、结果复制与下载
- 浅色、深色和跟随系统主题
- 大文件 Worker 处理与任务取消

## 隐私与权限

- 不上传数据，不发送网络请求
- 不读取网页内容，不注入内容脚本
- 不读取剪贴板，不保存输入和处理历史
- Manifest 只申请 `storage`，用于记住已打开的工作台标签页

## 安装

```bash
git clone https://github.com/cocoCzl/coco-tools.git
cd coco-tools
npm install
npm run build:json-toolbox
```

打开 `chrome://extensions/`，开启“开发者模式”，选择“加载已解压的扩展程序”，然后选择：

```text
tools/json-toolbox/dist
```

升级时拉取新版本、重新构建，然后在扩展管理页点击刷新。卸载时直接在扩展管理页移除 JSON 工具箱。

## 开发与验证

```bash
npm run dev:json-toolbox
npm run test:json-toolbox
npm run build:json-toolbox
npm run benchmark:json-toolbox
```

生产构建会自动生成本地图标、执行 TypeScript 检查，并验证 Manifest 权限及构建目录不超过 1 MB。

## 文档

- [产品需求](./docs/PRD-json-toolbox-v1.md)
- [开发任务](./docs/ISSUES-json-toolbox-v1.md)
- [手工测试用例](./docs/TEST-CASES.md)
- [架构说明](./docs/ARCHITECTURE.md)

## License

MIT
