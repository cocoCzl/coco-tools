# 转换工具箱 v1.0.0 发布验证

## 自动化基线

- `npm run check:converter-toolbox`：核心行为测试、类型检查、构建、Manifest 审计与 1 MB 目录体积检查。
- `npm run test:browser -w @coco-tools/converter-toolbox`：Playwright 加载 MV3 扩展，验证六模块、偏好恢复、JSON 错误保留、快捷键、Java 偏好与下载文件名。
- `npm run benchmark -w @coco-tools/converter-toolbox`：记录并强制校验 1 MB（≤200 ms）和 10 MB（≤2 秒）的 JSON 格式化与 JSON/YAML 往返基线。

## v1.0.0 验证结果

- Chrome-for-Testing 151：MV3 扩展加载、六模块、时间戳、单工作台标签、主题偏好、下载、离线无外部请求、Worker 取消、20 MB 导入提示和空闲 JS 堆检查均通过。
- 核心与发布检查：18 个 Node 行为测试、5 个浏览器发布回归、类型检查、Manifest 权限审计和 Release ZIP 打包均通过。
- 性能基线：由 `npm run benchmark -w @coco-tools/converter-toolbox` 在发布前重新记录 1 MB、10 MB、20 MB 结果；1 MB 和 10 MB 强制执行 PRD 时限。
- Release ZIP：`release/converter-toolbox-v1.0.0.zip`，小于 1 MB。

## 发布前手工矩阵

对当前稳定 Chrome 完成以下步骤，并记录操作系统、Chrome 版本、日期和结果：

1. 解压 `converter-toolbox-v1.0.0.zip`，从 `chrome://extensions` 加载；点击图标两次，确认只聚焦同一工作台标签页。
2. 在六个模块完成一次有效转换；验证导入、复制、下载、清空、浅色/深色/系统主题与窄窗口布局。
3. DevTools Network 设为 Offline 后重复上述操作，确认没有外部请求；检查 Manifest 仅含 `storage`，无内容脚本、站点权限或剪贴板读取权限。
4. 导入 1 MB、10 MB 与超过 20 MB 的 JSON/YAML，确认 Worker 可取消，切换模块和关闭工作台后没有旧结果写入。
5. DevTools Performance Monitor 记录空白工作台相对未打开扩展的增量内存；目标不超过 30 MB。

## 发布要求

发布前须重新运行自动化基线，并确认当前稳定版 Chrome 验证、性能和内存数据仍满足本文要求。
