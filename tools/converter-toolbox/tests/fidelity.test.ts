import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCompactJson, RawNumber, type CompactJson } from '../src/core/compact-json.ts'
import {
  formatYaml,
  jsonToYaml,
  yamlToJson,
  jsonToQuery,
  queryToJson,
  runOperation,
} from '../src/core/operations.ts'
import { MAX_NESTING_DEPTH } from '../src/core/limits.ts'
import { ToolError } from '../src/core/errors.ts'

function semantic(value: CompactJson): unknown {
  if (value instanceof RawNumber) {
    const [, sign, whole, fraction = '', exponent = '0'] =
      /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value.raw)!
    const digits = (whole + fraction).replace(/^0+/, '')
    if (!digits) return ['number', '0', '0']
    const coefficient = digits.replace(/0+$/, '')
    const scale =
      BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - coefficient.length)
    return ['number', sign + coefficient, String(scale)]
  }
  if (Array.isArray(value)) return ['array', value.map(semantic)]
  if (value && typeof value === 'object')
    return [
      'object',
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, semantic(item)]),
    ]
  return [value === null ? 'null' : typeof value, value]
}
const meaning = (text: string) => semantic(parseCompactJson(text))

const cases = [
  '{"id":9007199254740993,"s":"9007199254740993"}',
  '{"a":{},"b":[],"c":[{},[],{"x":[]}]}',
  '{"true":"x","false":1,"null":null,"123":"n","":"empty","a:b":"colon","a#b":false}',
  '{"a":"x *thing","b":"x &thing !tag # text: value","quote":"can\'t # stop","slash":"\\\\"}',
  '{"n":[-9007199254740993,1.234567890123456789,1e+400,-1.00,0,-0],"s":["1e3","true","null"]}',
  '{"__proto__":"x","constructor":{"toString":"y"}}',
  '{}',
  '[]',
  'null',
  'true',
  '123456789012345678901',
  '"hello"',
  '{"a ":"abc ","b":"two  ","c":" leading","d":"  "}',
  '"abc "',
  '[1,{"x":[]}]',
]
for (const json of cases)
  test(`YAML 语义往返：${json.slice(0, 60)}`, () => {
    const yaml = jsonToYaml(json).output
    const result = yamlToJson(yaml).output
    assert.deepEqual(meaning(result), meaning(json))
    assert.deepEqual(meaning(yamlToJson(formatYaml(yaml).output).output), meaning(json))
    assert.deepEqual(meaning(yamlToJson(json).output), meaning(json))
  })

test('所有语义转换路径拒绝重复键，包括流式集合与 Unicode 等价键', () => {
  for (const operation of ['format', 'minify', 'url', 'json-yaml', 'java'] as const) {
    assert.throws(() => runOperation(operation, '{"a":1,"\\u0061":2}'), /重复/)
  }
  for (const operation of ['yaml-json', 'yaml-format'] as const) {
    for (const source of ['a: 1\na: 2', 'ids: [{"a":1,"a":2}]', '- a: 1\n  a: 2']) {
      assert.throws(() => runOperation(operation, source), /重复/)
    }
  }
})

test('YAML 两条路径都保留流式大整数、小数、指数与数字字符串', () => {
  const source = 'ids: [9007199254740993, -1.234567890123456789, 1e+400, "9007199254740993"]'
  const expected = parseCompactJson(
    '{"ids":[9007199254740993,-1.234567890123456789,1e+400,"9007199254740993"]}',
  )
  assert.deepEqual(parseCompactJson(yamlToJson(source).output), expected)
  assert.deepEqual(parseCompactJson(yamlToJson(formatYaml(source).output).output), expected)
  assert.equal(
    jsonToQuery('{"id":9007199254740993,"n":[-1.00,1e+400]}').output,
    'id=9007199254740993&n=-1.00&n=1e%2B400',
  )
})

test('特殊字段作为普通自有键处理，不改变原型', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype)
  const output = queryToJson(
    '__proto__=abc&constructor=x&toString=y&__proto__=def&constructor=z',
  ).output
  const result = JSON.parse(output)
  assert.deepEqual(result.__proto__, ['abc', 'def'])
  assert.deepEqual(result.constructor, ['x', 'z'])
  assert.equal(result.toString, 'y')
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.equal(formatYaml('__proto__: x\na: 1').output, '__proto__: x\na: 1\n')
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before)
})

test('YAML 引号、注释、普通文本中的特殊字符区分于语法', () => {
  assert.deepEqual(JSON.parse(yamlToJson('foo[: x\na: x] # comment').output), {
    'foo[': 'x',
    a: 'x]',
  })
  assert.throws(() => yamlToJson('a: foo[ bar: baz'), /加引号/)
  assert.deepEqual(
    JSON.parse(yamlToJson(`a: text " # actual comment\nb: x ' # another comment`).output),
    { a: 'text "', b: "x '" },
  )
  const source = `a: "x *thing &ref !tag # comment: text" # real comment\nb: 'it''s # fine'\nc: x *thing\nd: a&b!c#d\ne: https://example.test\n`
  assert.deepEqual(JSON.parse(yamlToJson(source).output), {
    a: 'x *thing &ref !tag # comment: text',
    b: "it's # fine",
    c: 'x *thing',
    d: 'a&b!c#d',
    e: 'https://example.test',
  })
  for (const [source, fragment] of [
    ['a: 1\nb: *ref', '别名'],
    ['a: &ref x', '锚点'],
    ['a: !tag x', '标签'],
    ['a: |\n  text', '块文本'],
    ['<<: x', '合并键'],
    ['true: x', '字符串'],
    ['a: {x: 1}', '严格 JSON'],
  ]) {
    for (const op of ['yaml-json', 'yaml-format'] as const)
      assert.throws(() => runOperation(op, source), new RegExp(fragment))
  }
  assert.throws(
    () => yamlToJson('a: 1\nb: *ref'),
    (error: unknown) =>
      error instanceof ToolError &&
      error.location?.index === 8 &&
      error.location.line === 2 &&
      error.location.column === 4,
  )
})

test('JSON 根数组流式路径与其他路径一致拒绝非 JSON 空白', () => {
  for (const whitespace of ['\u00a0', '\uFEFF', '\u000b']) {
    for (const source of [
      `${whitespace}[{}]`,
      `[${whitespace}{}]`,
      `[{}${whitespace}]`,
      `[{}]${whitespace}`,
      `[${whitespace}]`,
    ]) {
      for (const op of ['format', 'minify', 'json-yaml', 'java'] as const)
        assert.throws(() => runOperation(op, source), ToolError)
    }
  }
  assert.doesNotThrow(() => jsonToYaml(' \t\r\n[ 1, 2 ]\n'))
})

test('YAML 深度受限，包含流式集合的重复解析不会重置深度边界', () => {
  const source = Array.from(
    { length: MAX_NESTING_DEPTH + 2 },
    (_, i) => `${'  '.repeat(i)}a:`,
  ).join('\n')
  assert.throws(() => yamlToJson(source), /512 层/)
})

test('结果下载元数据依据成功操作而定', () => {
  for (const [op, input, file, mime] of [
    ['yaml-json', 'a: 1', 'result.json', 'application/json'],
    ['json-yaml', '{"a":1}', 'result.yaml', 'application/yaml'],
    ['format', '{}', 'result.json', 'application/json'],
    ['url', '{}', 'result.txt', 'text/plain'],
    ['java', '{}', 'Root.java', 'text/x-java-source'],
  ] as const) {
    const result = runOperation(op, input)
    assert.equal(result.fileName, file)
    assert.ok(result.mimeType?.startsWith(mime))
  }
})

test('流式根数组验证结构、重复键和错误绝对位置', () => {
  for (const input of ['[1,]', '[,1]', '[1,,2]', '[{} }]', '[[]', '[{}] true'])
    assert.throws(() => jsonToYaml(input))
  assert.throws(
    () => runOperation('java', '[\n {"a":1},\n {"a":1,"a":2}\n]'),
    (error: unknown) =>
      error instanceof ToolError && error.location?.line === 3 && error.location.column === 9,
  )
  const input = '['.repeat(MAX_NESTING_DEPTH) + '0' + ']'.repeat(MAX_NESTING_DEPTH)
  assert.doesNotThrow(() => jsonToYaml(input))
  assert.throws(() => jsonToYaml(`[${input}]`), /512 层/)
  const flow =
    'a:\n  b: ' + '['.repeat(MAX_NESTING_DEPTH - 1) + '0' + ']'.repeat(MAX_NESTING_DEPTH - 1)
  assert.throws(() => yamlToJson(flow), /512 层/)
})

test('空集合也按 512 个容器计算深度，各路径一致', () => {
  const valid = '['.repeat(MAX_NESTING_DEPTH) + ']'.repeat(MAX_NESTING_DEPTH)
  const invalid = `[${valid}]`
  for (const operation of ['format', 'minify', 'json-yaml', 'yaml-json', 'yaml-format'] as const) {
    assert.doesNotThrow(() => runOperation(operation, valid))
    assert.throws(() => runOperation(operation, invalid), /512 层/)
  }
})
