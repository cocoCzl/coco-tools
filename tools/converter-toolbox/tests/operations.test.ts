import assert from 'node:assert/strict'
import { test } from 'node:test'
import { escapeJson, formatJson, formatYaml, generateJava, jsonToQuery, jsonToYaml, minifyJson, queryToJson, runOperation, unescapeJson, yamlToJson } from '../src/core/operations.ts'
import { currentTimeDescription, localDateTimeToTimestamps, timestampToLocal, utcOffset } from '../src/core/timestamp.ts'
import { INPUT_LIMIT_BYTES, MAX_NESTING_DEPTH, OUTPUT_LIMIT_BYTES, utf8Bytes } from '../src/core/limits.ts'

test('格式化与压缩保留 JSON 原始数字和转义标记', () => {
  const input = '{"id":900719925474099312345,"rate":1.00,"scientific":1e+3,"text":"\\u4e2d\\u6587"}'
  const formatted = formatJson(input).output
  assert.match(formatted, /900719925474099312345/)
  assert.match(formatted, /1\.00/)
  assert.match(formatted, /1e\+3/)
  assert.match(formatted, /\\u4e2d/)
  assert.equal(minifyJson(formatted).output, input)
})

test('严格 JSON 拒绝重复字段并提供位置', () => {
  assert.throws(() => formatJson('{"a": 1, "a": 2}'), /第 1 行，第 10 列.*重复/)
})

test('JSON 转义和反转义保持中文默认可读', () => {
  assert.equal(escapeJson('a\n中文').output, '"a\\n中文"')
  assert.equal(unescapeJson('"a\\n中文"').output, 'a\n中文')
})

test('核心 JSON 格式化和压缩拒绝空输入', () => {
  assert.throws(() => formatJson('   '), /请输入 JSON/)
  assert.throws(() => minifyJson(''), /请输入 JSON/)
})

test('JSON 格式化支持界面传入的缩进选项', () => {
  assert.match(formatJson('{"a":{"b":1}}', 4).output, /^\{\n {4}"a": \{\n {8}"b": 1/m)
  assert.match(formatJson('{"a":{"b":1}}', 'tab').output, /^\{\n\t"a": \{\n\t\t"b": 1/m)
  assert.match(runOperation('format', '{"a":{"b":1}}', { indent: '4' }).output, /^\{\n {4}"a": \{/m)
})

test('URL 参数保留字符串、重复项和加号语义', () => {
  assert.equal(queryToJson('https://example.test/a?code=001&tag=a&tag=b&q=a+b%2Bc').output, '{\n  "code": "001",\n  "tag": [\n    "a",\n    "b"\n  ],\n  "q": "a b+c"\n}')
  assert.equal(jsonToQuery('{"code":"001","tag":["a","b"]}').output, 'code=001&tag=a&tag=b')
})

test('YAML 只处理 JSON 兼容安全子集', () => {
  assert.equal(yamlToJson('name: coco\nenabled: true\nitems:\n  - 1\n  - two\n').output, '{\n  "name": "coco",\n  "enabled": true,\n  "items": [\n    1,\n    "two"\n  ]\n}')
  assert.match(jsonToYaml('{"name":"coco"}').output, /name: coco/)
  assert.match(formatYaml('name: coco\n').output, /name: coco/)
  assert.throws(() => yamlToJson('base: &base\n  name: coco\ncopy: *base\n'), /锚点/)
  assert.throws(() => yamlToJson('{"name":"coco"}'), /检测到 JSON 输入，请使用“JSON → YAML”/)
})

test('Java 数据类可生成 Lombok 输出和基本类型', () => {
  const result = generateJava('{"user-id":1,"active":true,"tags":["a"]}', { rootClassName: 'user result', lombok: true }).output
  assert.match(result, /@Data/)
  assert.match(result, /public class UserResult/)
  assert.match(result, /private Integer userId;/)
  assert.match(result, /private Boolean active;/)
  assert.match(result, /private List<String> tags;/)
})

test('Java 数据类合并对象数组、生成安全数字与 Jackson 映射', () => {
  const result = generateJava('[{"user-name":"Ada","id":1,"amount":1.00},{"id":9223372036854775808,"tags":[{"name":"x"}]}]', { rootClassName: 'api response', packageName: 'com.example.model', jackson: true })
  assert.equal(result.fileName, 'ApiResponse.java')
  assert.match(result.output, /^package com\.example\.model;/)
  assert.match(result.output, /private BigInteger id;/)
  assert.match(result.output, /private BigDecimal amount;/)
  assert.match(result.output, /@JsonProperty\("user-name"\)/)
  assert.match(result.output, /public static class Tags/)
})

test('Java 数据类拒绝空或混合根数组并报告不确定字段', () => {
  assert.throws(() => generateJava('[]'), /空数组无法推断/)
  assert.throws(() => generateJava('[{"id":1}, false]'), /第 2 个元素不是对象/)
  const result = generateJava('{"empty":[],"unknown":null,"mixed":[1,"two"]}')
  assert.match(result.output, /List<Object> empty/)
  assert.ok(result.warnings?.length)
})

test('YAML 明确拒绝全部不支持的语义特性', () => {
  for (const source of ['a: &ref value\nb: *ref', 'a: !custom value', 'base: {x: 1}\nitem:\n  <<: *base', '---\na: 1\n...']) assert.throws(() => yamlToJson(source), /暂不支持/)
  assert.throws(() => yamlToJson('a: 1\na: 2'), /重复键/)
})

test('YAML 子集支持缩进集合、注释和 JSON 风格流式集合', () => {
  const result = yamlToJson('users:\n  - name: Ada # primary\n    tags: ["dev", "ops"]\n  - name: Bob\n    active: true\n').output
  assert.equal(result, '{\n  "users": [\n    {\n      "name": "Ada",\n      "tags": [\n        "dev",\n        "ops"\n      ]\n    },\n    {\n      "name": "Bob",\n      "active": true\n    }\n  ]\n}')
  assert.throws(() => yamlToJson('note: |\n  long text'), /块文本/)
  assert.throws(() => yamlToJson('enabled: yes'), /隐式类型/)
})

test('时间戳以浏览器本地时区完成 10、13 位转换并拒绝非法日期', () => {
  const milliseconds = new Date(2024, 5, 1, 12, 34, 56).getTime()
  assert.match(timestampToLocal(String(Math.floor(milliseconds / 1000))), /2024/)
  assert.equal(localDateTimeToTimestamps('2024-06-01', '12:34:56').milliseconds, String(milliseconds))
  assert.throws(() => timestampToLocal('123'), /10 位或 13 位/)
  assert.throws(() => localDateTimeToTimestamps('2024-02-31', '12:00:00'), /有效的本地日期/)
  assert.match(utcOffset(new Date()), /^UTC[+-]\d{2}:\d{2}$/)
  assert.match(currentTimeDescription(new Date(milliseconds)), /星期/)
})

test('转换任务强制执行 UTF-8 输入、输出和嵌套深度边界', () => {
  assert.equal(INPUT_LIMIT_BYTES, 20 * 1024 * 1024)
  assert.equal(OUTPUT_LIMIT_BYTES, 40 * 1024 * 1024)
  assert.equal(utf8Bytes('中'), 3)
  assert.throws(() => runOperation('escape', '中'.repeat(Math.floor(INPUT_LIMIT_BYTES / 3) + 1)), /20 MiB/)
  assert.throws(() => runOperation('escape', 'é'.repeat(7_000_000), { escapeNonAscii: true }), /40 MiB/)
  const valid = '['.repeat(MAX_NESTING_DEPTH) + '0' + ']'.repeat(MAX_NESTING_DEPTH)
  assert.equal(minifyJson(valid).output, valid)
  const invalid = `[${valid}]`
  assert.throws(() => minifyJson(invalid), /512 层/)
})
