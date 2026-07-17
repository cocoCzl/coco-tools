import assert from 'node:assert/strict'
import test from 'node:test'

import { ToolError } from '../src/core/errors.ts'
import { formatJson, minifyJson, parseJson } from '../src/core/json.ts'

test('formats JSON without rewriting token text', () => {
  const input = '{"big":9007199254740993,"money":1.00,"power":1e3,"letter":"\\u0061","items":[true,null]}'
  const output = formatJson(input, 2)
  assert.match(output, /9007199254740993/)
  assert.match(output, /1\.00/)
  assert.match(output, /1e3/)
  assert.match(output, /"\\u0061"/)
  assert.equal(minifyJson(output), input)
})

test('supports all indentation modes', () => {
  assert.match(formatJson('{"a":{"b":1}}', 4), /\n    "a": \{\n        "b"/)
  assert.match(formatJson('{"a":{"b":1}}', 'tab'), /\n\t"a": \{\n\t\t"b"/)
})

test('rejects duplicate keys with a location', () => {
  assert.throws(
    () => parseJson('{\n  "name": "A",\n  "name": "B"\n}'),
    (error: unknown) => {
      assert.ok(error instanceof ToolError)
      assert.equal(error.code, 'DUPLICATE_KEY')
      assert.deepEqual(error.location && { line: error.location.line, column: error.location.column }, { line: 3, column: 3 })
      return true
    },
  )
})

test('rejects non-standard and malformed JSON', () => {
  for (const input of ["{'a':1}", '{"a":1,}', '[1,]', '{a:1}', '{"a":01}']) {
    assert.throws(() => parseJson(input), ToolError)
  }
})

test('preserves object key order', () => {
  const output = formatJson('{"z":1,"a":2,"m":3}')
  assert.ok(output.indexOf('"z"') < output.indexOf('"a"'))
  assert.ok(output.indexOf('"a"') < output.indexOf('"m"'))
})
