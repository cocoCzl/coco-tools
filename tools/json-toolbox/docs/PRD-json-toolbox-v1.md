# JSON 工具箱 V1 PRD

状态：V1 已实现，待发布
目标平台：桌面版 Google Chrome
发布方式：GitHub 开源仓库与 GitHub Releases
许可证：MIT

## Problem Statement

开发者在日常工作中经常需要格式化、校验、转义或转换 JSON，也需要根据 JSON 样例快速生成 Java 数据类。目前这些任务通常依赖搜索引擎找到不同的在线工具，存在以下问题：

- 操作入口分散，重复搜索和切换页面降低效率。
- 业务数据可能包含隐私或敏感信息，粘贴到在线服务存在泄露风险。
- 在线工具依赖网络，质量、可用性和数据处理规则不一致。
- 部分在线工具包含广告、统计脚本或重量级页面，占用不必要的 CPU 和内存。
- 大整数、重复字段或复杂数组可能被在线工具静默改写，结果缺少可信度。

## Goals

- 提供一个固定、快速、离线的 JSON 工具入口，替代反复搜索在线工具。
- 在浏览器本地完成所有数据处理，不上传或记录用户内容。
- 覆盖最常用的四组 JSON 任务，并为每种转换提供明确、可预测的规则。
- 在 1–10 MB JSON 的常见场景下保持较快响应和可取消的交互。
- 控制扩展安装包、空闲内存、权限和后台活动，使其适合作为长期安装的开发工具。
- 输出能够直接复制或下载的 Java 数据类，并正确处理嵌套结构、大整数和非法 Java 标识符。

## Solution

构建名为“JSON 工具箱”的独立 Chrome 扩展。用户点击浏览器工具栏图标后，扩展打开独立的 JSON 工作台标签页。工作台通过四个页签提供 JSON 格式化、JSON 转义、URL 查询参数转换和 Java 数据类生成。

所有输入均由用户主动粘贴或从本地文件导入，所有处理都在浏览器本地完成。工作台使用轻量双栏界面，转换由用户主动触发；大任务在按需后台线程中执行，并支持取消和及时释放资源。

## Functional Scope

### JSON 格式化、校验与压缩

- 只接受严格标准 JSON，不兼容注释、单引号、未加引号字段或尾随逗号。
- 检测同一对象中的重复字段名，将其视为错误并报告位置。
- 错误信息包含行号、列号和可理解的错误原因。
- 默认使用 2 个空格缩进，可切换为 4 个空格或 Tab。
- 保持字段顺序，不自动排序。
- 格式化和压缩只调整字符串外部的空白，不改写大整数、数字字面量、Unicode 转义或其他有效标记文本。
- 压缩删除所有非必要空白，但不改变数据内容。

### JSON 转义与反转义

- 转义结果为带外层双引号的完整合法 JSON 字符串字面量。
- 反转义只接受合法 JSON 字符串字面量，并恢复原始文本。
- 默认保留中文等非 ASCII 字符，只转义引号、反斜杠和控制字符。
- 提供“转义非 ASCII 字符”开关，开启后使用 Unicode 转义。
- 非法转义序列必须报错，不进行猜测性修复。

### JSON 与 URL 查询参数互转

- URL 参数转 JSON 支持完整 URL、以 `?` 开头的查询字符串和纯查询字符串。
- 只解析查询参数，不将路径或 `#fragment` 放入输出。
- URL 参数值一律保留为字符串，不自动推断数字、布尔值或 `null`。
- 重复参数转换为字符串数组。
- 编解码遵循 `application/x-www-form-urlencoded`：空格使用 `+`，真正的加号使用 `%2B`，中文使用 UTF-8 百分号编码。
- 非法或不完整的百分号编码必须报错。
- JSON 转 URL 的根节点必须是对象。
- 字段值支持字符串、数字、布尔值、`null` 和基本类型数组。
- 数组使用重复参数表示；嵌套对象和对象数组明确报错。
- `null` 编码为文本 `null`；空数组不输出参数并显示警告。

### JSON 生成 Java 数据类

- 生成普通 Java 数据类，不生成 JPA 数据库实体注解。
- 输出兼容 Java 8 及以上版本，不生成 `record`。
- 默认生成私有字段和 getter/setter，不生成显式构造函数。
- Lombok 为可选项且默认关闭；开启后生成 `@Data` 并省略 getter/setter。
- Jackson 映射默认开启；字段名被规范化时生成必要的 `@JsonProperty`。
- 根类名称可编辑，默认使用 `Root`；包名可选。
- 输出为单个 Java 文件，一个公开根类包含必要的 `public static` 嵌套类。
- 根节点支持对象或对象数组；对象数组扫描全部对象并合并字段。
- 根数组混入非对象元素时停止生成并报告位置。
- `{}` 生成空根类并警告；`[]` 无法推断类型，不生成结果。
- 空字段数组生成 `List<Object>` 并警告。
- 字段在全部样例中均为 `null` 时使用 `Object`；`null` 与具体类型并存时采用具体类型。
- 互不兼容的具体类型使用 `Object` 并警告；数字类型按安全范围提升。
- 字符串一律生成 `String`，不自动推断日期、UUID 或枚举。
- 整数依次映射为 `Integer`、`Long` 或 `BigInteger`；小数及指数形式映射为 `BigDecimal`。
- 布尔和数字字段统一使用包装类型。
- 同类型数组生成 `List<T>`；不兼容的混合数组生成 `List<Object>` 并警告。
- 类名使用 `PascalCase`，字段名使用 `camelCase`。
- Java 关键字和非法标识符自动调整；名称变化通过 Jackson 注解保留原始映射。
- 名称冲突时追加数字并警告，不静默覆盖字段。
- 对象数组元素类使用确定性名称，例如 `users` 对应 `UsersItem`，不自动做英文单复数转换。
- 语义不同但结构相同的嵌套对象分别生成类型，不自动复用。

### 文件与通用操作

- 支持导入 UTF-8 编码的 `.json` 和 `.txt` 文件，并兼容 UTF-8 BOM。
- 不自动猜测 GBK 等其他编码。
- 各工具提供复制结果、清空内容、导入文件和下载结果操作。
- Java 输出文件名与根类名一致；文本下载统一使用 LF 换行符。
- 大于 20 MB 的文件显示性能警告，但允许用户选择继续。
- 不提供读取剪贴板的按钮；用户通过系统粘贴快捷键输入。
- 输入和输出分区显示，转换结果不覆盖原始输入。
- 发生错误时保留输入并清空旧输出，防止误用过期结果。
- 大任务支持取消；重新执行、切换页签或关闭页面时终止旧任务。

## User Stories

1. As a developer, I want to open a fixed JSON workbench from the Chrome toolbar, so that I no longer need to search for online tools.
2. As a developer, I want all processing to happen locally, so that sensitive JSON never leaves my browser.
3. As a developer, I want the workbench to function offline, so that my workflow does not depend on network availability.
4. As a developer, I want to format strict JSON with one action, so that nested data becomes readable.
5. As a developer, I want to choose 2 spaces, 4 spaces, or Tab indentation, so that output matches my project convention.
6. As a developer, I want formatting to preserve field order, so that the result remains easy to compare with the source.
7. As a developer, I want large integers and numeric literals preserved exactly, so that formatting cannot corrupt identifiers or financial values.
8. As a developer, I want duplicate object keys reported as errors, so that values are not silently discarded.
9. As a developer, I want precise line and column errors, so that I can repair invalid JSON quickly.
10. As a developer, I want to minify JSON without changing its data tokens, so that I can reduce text size safely.
11. As a developer, I want to escape text as a complete JSON string literal, so that I can paste it into another JSON document safely.
12. As a developer, I want to unescape a valid JSON string, so that I can recover and inspect its original text.
13. As a developer, I want Chinese characters preserved by default, so that escaped content remains readable.
14. As a developer, I want optional Unicode escaping, so that I can work with older systems requiring ASCII-only output.
15. As a developer, I want to paste a full URL or query string, so that I can inspect its parameters without preprocessing it.
16. As a developer, I want repeated URL parameters represented as arrays, so that no repeated values are lost.
17. As a developer, I want URL parameter values kept as strings, so that values such as `001` are not incorrectly converted.
18. As a developer, I want malformed percent encoding reported, so that invalid URLs do not produce misleading JSON.
19. As a developer, I want to convert a flat JSON object into standard query parameters, so that I can construct request URLs quickly.
20. As a developer, I want unsupported nested query structures rejected explicitly, so that the tool does not invent incompatible encoding rules.
21. As a Java developer, I want JSON objects converted into Java data classes, so that I can avoid manually writing repetitive fields.
22. As a Java developer, I want object arrays scanned completely, so that fields appearing after the first sample are not omitted.
23. As a Java developer, I want safe numeric type inference, so that large integers and decimals retain their precision.
24. As a Java developer, I want mixed or unknown types to generate warnings, so that uncertain schema decisions remain visible.
25. As a Java developer, I want Jackson mappings for renamed fields, so that generated classes deserialize the original JSON correctly.
26. As a Java developer, I want optional Lombok output, so that I can choose between zero-Lombok POJOs and concise classes.
27. As a Java developer, I want a single downloadable Java file, so that generated output is easy to copy into a project.
28. As a developer, I want to import local JSON and text files, so that large inputs do not need to pass through the clipboard.
29. As a developer, I want to download processed results, so that large output can be saved without manual copying.
30. As a developer, I want old output cleared after errors, so that I cannot mistake stale content for a new result.
31. As a developer, I want large operations to remain cancellable, so that a mistaken task does not lock the workbench.
32. As a developer, I want the interface to follow my light or dark theme preference, so that it fits my working environment.
33. As a keyboard user, I want local shortcuts for executing and copying, so that repeated transformations are faster.
34. As a privacy-conscious user, I want no history or input persistence, so that reopening the extension cannot expose previous data.
35. As a Chrome user, I want the extension to request minimal permissions, so that I can install it with confidence.
36. As a developer working with large files, I want syntax coloring to degrade gracefully, so that visual decoration does not cause high memory use.
37. As a GitHub user, I want versioned release packages and installation instructions, so that I can install and upgrade the extension predictably.

## Non-functional Requirements

### Performance and memory

- Release 安装包压缩后不超过 1 MB。
- 扩展关闭时不保留持续运行的后台任务，额外常驻内存接近 0。
- 空白 JSON 工作台的增量空闲内存目标不超过 30 MB。
- 1 MB JSON 的常见转换目标在 200 ms 内完成。
- 10 MB JSON 的常见转换目标在 2 秒内完成，界面不得长时间无响应。
- 大于 1 MB 的任务使用按需后台线程，任务结束或取消后立即终止线程。
- 大文件处理中允许内存随输入、输出和临时副本增长；清空、取消或关闭后相关大对象必须可被释放。
- 性能基线使用当前稳定版 Chrome、关闭开发者工具、至少 8 GB 内存的常见桌面设备；每项执行 5 次并以中位数判断。

### Privacy and security

- 所有数据处理在浏览器本地完成，不发送网络请求。
- 不接入统计、崩溃上报、广告、CDN 或自动更新检查。
- 不读取普通网页内容，不申请站点访问权限，不注入内容脚本。
- 不申请剪贴板读取权限。
- 不保存输入、输出或历史记录，只保存主题、缩进和生成选项等非敏感偏好。
- 不使用远程代码、字符串动态执行或外部运行时资源。

### Usability and visual quality

- 工作台由四个独立页签组成，只初始化当前工具需要的状态。
- 桌面宽度使用左右双栏，窄窗口自动改为上下排列。
- 采用现代开发者工具风格，使用系统 UI 字体、系统等宽字体和单一蓝紫色强调色。
- 默认跟随系统主题，并允许手动选择浅色、深色或跟随系统。
- 小于等于 1 MB 的内容可以显示基础语法着色；大于 1 MB 时自动降级为轻量文本模式。
- 控件支持键盘操作、清晰焦点状态和足够文字对比度；状态不能只通过颜色表达。
- `Ctrl/⌘ + Enter` 执行当前转换，`Ctrl/⌘ + Shift + C` 复制当前输出；快捷键不注册为浏览器全局快捷键。

### Compatibility

- 使用 Chrome Manifest V3。
- 官方支持当前稳定版 Chrome 及之前两个主要版本。
- 支持 Windows、macOS 和 Linux 桌面版 Chrome。
- Edge、Brave 等 Chromium 浏览器允许尝试安装，但 V1 不作正式兼容承诺。
- Java 输出兼容 Java 8 及以上版本。

## Implementation Decisions

- JSON 工具箱作为 `coco-tools` 中的独立扩展存在，不与 TSP CVT 共享运行时代码、状态或用户数据。
- 点击扩展工具栏图标后打开独立 JSON 工作台标签页，不使用工具栏弹窗或 Side Panel。
- 使用 TypeScript 与浏览器原生 HTML、CSS 和 API，不使用 React、Vue 等运行时框架。
- 不引入 Monaco、CodeMirror、重量级组件库或远程 UI 资源。
- JSON 格式化采用无损标记处理方式；不得以 `JSON.parse` 后再序列化作为主路径。
- JSON 处理层需要同时承担严格语法校验、重复字段检测、行列定位和原始标记保留。
- UI、转换规则和文件操作相互分层，使核心转换能力可以脱离 Chrome 页面进行行为测试。
- 小任务直接执行；超过 1 MB 的任务通过按需 Worker 执行，Worker 支持取消并在任务结束后销毁。
- 工具页签采用懒初始化，不保留离开页签后的无用大数据或执行任务。
- 扩展只持久化非敏感偏好，不持久化输入与输出。
- Jackson 开关默认开启，Lombok 开关默认关闭，缩进默认 2 个空格，主题默认跟随系统。
- GitHub Releases 提供版本化安装包；项目使用 MIT License。

## Testing Decisions

- 测试只验证外部可观察行为，不断言内部函数调用、DOM 实现方式或 Worker 内部结构。
- 核心转换层作为首要测试接缝，覆盖 JSON 格式化、压缩、转义、URL 参数转换和 Java 数据类生成。
- 无损 JSON 测试必须覆盖超大整数、`1.00`、指数数字、Unicode 转义、字段顺序、字符串内空白和重复字段。
- 错误测试必须验证错误分类及行列位置，包括尾随逗号、非法转义、非法百分号编码和不支持的嵌套 URL 结构。
- Java 生成测试覆盖对象数组字段合并、数字提升、空数组、全 null 字段、混合类型、关键字字段、字段冲突、Jackson 和 Lombok 模式。
- Worker 边界测试验证大任务结果与同步结果一致，并验证取消、重新执行和页签切换不会提交旧结果。
- Chrome 工作台端到端测试覆盖工具栏入口、四页签、双栏输入输出、导入、下载、复制、主题和快捷键。
- 权限检查验证 Manifest 不包含站点访问、内容脚本或剪贴板读取权限。
- 离线测试在阻断网络后运行全部功能，并确认不存在外部请求。
- 性能测试使用固定数据集记录 1 MB、10 MB 和超过 20 MB 场景的时间、可取消性及内存释放情况。
- 发布测试验证压缩安装包不超过 1 MB，并检查 GitHub Release 包可通过“加载已解压的扩展程序”安装。
- 现有 TSP CVT 没有可复用的测试体系，因此 JSON 工具箱需要建立独立、行为导向的测试接缝，不以复用旧 React UI 测试为目标。

## Acceptance Criteria

1. 用户点击扩展工具栏图标后，Chrome 打开独立的 JSON 工作台标签页。
2. 工作台提供“格式化”“转义”“URL 参数”“Java 数据类”四个页签，并且每个页签采用独立输入和输出区域。
3. 格式化包含超大整数、`1.00`、指数数字和 Unicode 转义的合法 JSON 后，除字符串外部空白外，原始标记和字段顺序保持不变。
4. 压缩 JSON 后所有非必要空白被移除，字符串内容和其他数据标记保持不变。
5. 重复字段、尾随逗号和非法转义均被拒绝，错误提示包含正确行号和列号，旧输出被清空。
6. 转义输出是完整合法的 JSON 字符串字面量，反转义能够恢复原始文本。
7. 默认转义保留中文；开启非 ASCII 转义后，中文能够转换为 Unicode 转义形式。
8. 完整 URL、带 `?` 查询字符串和纯查询字符串产生一致的参数 JSON；重复参数转换为数组。
9. URL 参数 `code=001&enabled=true` 转换后保留为字符串，不推断为数字或布尔值。
10. 非法百分号编码被拒绝；嵌套 JSON 转 URL 时明确报错，不生成私有编码格式。
11. 对象数组生成 Java 数据类时扫描所有元素，并合并后续元素新增的字段。
12. Java 生成正确区分 `Integer`、`Long`、`BigInteger` 和 `BigDecimal`，数字数组按安全规则提升。
13. 混合类型数组、全 null 字段、空数组和互不兼容字段类型产生既定的 `Object` 类型或错误，并显示警告。
14. 非法 Java 字段名和关键字被规范化；Jackson 开启时生成正确原始字段映射。
15. 默认模式生成带 getter/setter 的 POJO；Lombok 模式生成 `@Data` 并省略 getter/setter。
16. Java 输出是单个可复制、可下载的 `.java` 文件，根类名和可选包名正确生效。
17. 用户可以导入 UTF-8 `.json` 或 `.txt` 文件并下载结果；UTF-8 BOM 被正确处理。
18. 超过 20 MB 的文件显示警告；用户选择继续后任务可执行且可取消。
19. 10 MB JSON 处理期间界面保持可交互，任务取消、重新执行或切换页签后不会展示旧任务结果。
20. 清空输入、取消任务或关闭工作台后，大任务 Worker 被终止，重新打开时不恢复之前的敏感内容。
21. 断网后四组工具、文件导入和结果下载仍可正常使用，且不存在外部网络请求。
22. Manifest 不申请站点访问、网页读取或剪贴板读取权限。
23. 浅色、深色和跟随系统主题均可使用，保存的仅为非敏感界面偏好。
24. 当前稳定版 Chrome 及之前两个主要版本能够安装和运行 Release 包。
25. Release 压缩安装包不超过 1 MB，性能基线结果随首次发布检查记录。

## Out of Scope

- JSONPath 查询或表达式执行。
- JSON Diff、合并和补丁生成。
- JSON Schema 创建、验证或代码生成。
- Mock 数据和随机测试数据生成。
- JSON 与 XML、YAML、CSV 等格式互转。
- Java 之外的 TypeScript、Kotlin、C#、Go 等数据类生成。
- Java `record`、JPA 实体、数据库表映射或 ORM 关系推断。
- 日期、UUID、枚举或业务语义的自动类型推断。
- URL 嵌套对象的点号、方括号或第三方框架编码规则。
- 自动读取当前网页 JSON、网页内容脚本和右键菜单入口。
- 自动读取剪贴板、保存转换历史或跨设备同步。
- 用户账号、云端服务、在线 AI、统计和崩溃上报。
- Chrome 应用商店发布；V1 首先通过 GitHub 分发。
- Edge、Brave 等非 Chrome 浏览器的正式兼容保证。
- IDE 级代码编辑、始终开启的大文件语法高亮或插件生态。

## Further Notes

- 产品中文名称为“JSON 工具箱”，英文标识为 “JSON Toolbox”。
- 品牌图标使用 `{ }` 花括号和蓝紫色方形底色，保证 16 px 下可辨识。
- “JSON 工作台”指用户集中输入、转换和查看 JSON 及相关文本的主要操作空间。
- “Java 数据类”指由 JSON 数据结构推导出的普通 Java 对象类型，用于承载数据，不表达数据库持久化关系；不等同于 JPA 数据库实体。
- 原生 Web 技术、无损 JSON 标记处理和独立标签页入口均为已接受的架构决策。
- 首次发布前必须完成行为测试、大文件性能测试、权限审计和离线验证。
