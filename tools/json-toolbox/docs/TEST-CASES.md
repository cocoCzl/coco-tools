# JSON 工具箱手工测试用例

每次修改后先执行：

```bash
npm run check:json-toolbox
npm run benchmark:json-toolbox
```

重新构建后，在 `chrome://extensions/` 中点击 JSON 工具箱的刷新按钮，再打开工作台测试。

## 1. JSON 格式化无损测试

输入：

```json
{"big":9007199254740993,"money":1.00,"power":1e3,"letter":"\u0061","items":[true,null]}
```

点击“格式化”，确认：

- 输出具有缩进。
- `9007199254740993`、`1.00`、`1e3`、`"\u0061"` 保持原样。
- 切换 2 空格、4 空格和 Tab 后缩进正确。
- 点击“压缩”后恢复为单行，数据标记仍未改变。

## 2. JSON 错误定位测试

输入：

```json
{
  "name": "A",
  "name": "B"
}
```

点击“格式化”，应提示第 3 行字段 `name` 重复，并且输出区为空。

再测试尾随逗号：

```json
{"name":"A",}
```

应提示对象末尾不能包含多余逗号。

## 3. JSON 转义测试

输入：

```text
中文
"path\file"
```

点击“转义”，输出应为完整 JSON 字符串，包含外层双引号。再点击“反转义”，应恢复原文。

开启“转义非 ASCII 字符”后输入：

```text
中文
```

输出应为：

```text
"\u4e2d\u6587"
```

## 4. URL 参数转 JSON 测试

输入：

```text
https://example.com/api?code=001&enabled=true&tag=java&tag=json&space=a+b&plus=%2B#detail
```

点击“URL → JSON”，输出应等价于：

```json
{
  "code": "001",
  "enabled": "true",
  "tag": ["java", "json"],
  "space": "a b",
  "plus": "+"
}
```

输入 `value=%Q1` 时应提示百分号编码非法。

## 5. JSON 转 URL 参数测试

输入：

```json
{"tag":["java","json"],"code":"001","enabled":true,"empty":[],"nil":null}
```

点击“JSON → URL”，输出应为：

```text
tag=java&tag=json&code=001&enabled=true&nil=null
```

同时应警告字段 `empty` 是空数组并已跳过。

输入嵌套对象 `{"filter":{"status":"open"}}` 时应明确报错。

## 6. Java 数据类生成测试

输入：

```json
[
  {
    "user-name": "Ada",
    "id": 1,
    "money": 1.25,
    "tags": ["java"],
    "profile": {"city": "Shanghai"}
  },
  {
    "user-name": "Lin",
    "id": 2147483648,
    "enabled": true,
    "tags": ["json", "tool"]
  }
]
```

设置根类名 `UserPayload`、包名 `com.example.model`，点击“生成数据类”，确认：

- 文件名为 `UserPayload.java`。
- `id` 使用 `Long`，`money` 使用 `BigDecimal`。
- 第二个对象中的 `enabled` 字段没有遗漏。
- `user-name` 生成合法字段名并带 `@JsonProperty("user-name")`。
- `profile` 生成静态嵌套类。
- 关闭 Lombok 时存在 getter/setter；开启 Lombok 后使用 `@Data`。

## 7. 文件、主题与隐私测试

- 导入 UTF-8 `.json` 或 `.txt` 文件，确认内容进入当前输入区。
- 点击复制和下载，确认结果及文件名正确。
- 测试浅色、深色和跟随系统主题，刷新后主题偏好保留。
- 输入敏感内容后刷新工作台，确认输入和输出不会恢复。
- 断开网络后重复以上核心转换，确认功能仍可使用。
- 在扩展详情中确认没有站点访问、网页内容读取或剪贴板读取权限。
