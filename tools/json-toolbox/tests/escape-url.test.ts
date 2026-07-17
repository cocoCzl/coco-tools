import assert from 'node:assert/strict'
import test from 'node:test'

import { escapeJsonString, unescapeJsonString } from '../src/core/escape.ts'
import { recommendedOperation } from '../src/core/operations.ts'
import { jsonToQuery, queryToJson } from '../src/core/url.ts'

test('escapes and unescapes a complete JSON string literal', () => {
  const input = '中文\n"path\\file"'
  const escaped = escapeJsonString(input)
  assert.equal(escaped, '"中文\\n\\"path\\\\file\\""')
  assert.equal(unescapeJsonString(escaped), input)
})

test('optionally escapes non-ASCII characters', () => {
  assert.equal(escapeJsonString('中文', true), '"\\u4e2d\\u6587"')
})

test('rejects non-string input during unescape', () => {
  assert.throws(() => unescapeJsonString('{"a":1}'), /必须是包含外层双引号/)
})

test('converts full URLs and repeated parameters to JSON strings', () => {
  const result = queryToJson('https://example.com/path?code=001&enabled=true&tag=a&tag=b&space=a+b&plus=%2B#part')
  assert.deepEqual(JSON.parse(result.output), {
    code: '001',
    enabled: 'true',
    tag: ['a', 'b'],
    space: 'a b',
    plus: '+',
  })
})

test('rejects malformed percent encoding', () => {
  assert.throws(() => queryToJson('value=%E4%B8'), /无效的 UTF-8/)
  assert.throws(() => queryToJson('value=%Q1'), /非法或不完整/)
})

test('converts flat JSON objects to standard query strings', () => {
  const result = jsonToQuery('{"tag":["java","json"],"code":"001","enabled":true,"empty":[],"nil":null}')
  assert.equal(result.output, 'tag=java&tag=json&code=001&enabled=true&nil=null')
  assert.deepEqual(result.warnings, ['字段“empty”是空数组，已跳过。'])
})

test('rejects nested query structures', () => {
  assert.throws(() => jsonToQuery('{"filter":{"status":"open"}}'), /嵌套对象/)
  assert.throws(() => jsonToQuery('{"rows":[{"id":1}]}'), /包含对象或嵌套数组/)
})

test('recognizes full URLs before they reach the JSON formatter', () => {
  assert.equal(recommendedOperation('https://example.com/api?code=001'), 'query-to-json')
  assert.equal(recommendedOperation('?code=001'), 'query-to-json')
  assert.equal(recommendedOperation('{"code":"001"}'), undefined)
})
