import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { generateJavaDataClass } from '../src/core/java.ts'

test('generates a Java 8 POJO with nested classes and safe numbers', () => {
  const result = generateJavaDataClass(`{
    "name": "Ada",
    "active": true,
    "count": 12,
    "large": 2147483648,
    "huge": 9223372036854775808,
    "money": 1.25,
    "profile": {"city": "Shanghai"}
  }`)
  assert.match(result.output, /public class Root/)
  assert.match(result.output, /private String name;/)
  assert.match(result.output, /private Boolean active;/)
  assert.match(result.output, /private Integer count;/)
  assert.match(result.output, /private Long large;/)
  assert.match(result.output, /private BigInteger huge;/)
  assert.match(result.output, /private BigDecimal money;/)
  assert.match(result.output, /public static class Profile/)
  assert.match(result.output, /public String getName\(\)/)
})

test('merges all root object array samples', () => {
  const result = generateJavaDataClass('[{"id":1,"name":"A"},{"id":2147483648,"enabled":true}]')
  assert.match(result.output, /private Long id;/)
  assert.match(result.output, /private String name;/)
  assert.match(result.output, /private Boolean enabled;/)
})

test('handles arrays, null and incompatible values with warnings', () => {
  const result = generateJavaDataClass(`{
    "numbers": [1, 2147483648, 1.5],
    "users": [{"id": 1}, {"id": 2, "name": "B"}],
    "empty": [],
    "unknown": null,
    "mixed": [1, "two", true]
  }`)
  assert.match(result.output, /private List<BigDecimal> numbers;/)
  assert.match(result.output, /private List<UsersItem> users;/)
  assert.match(result.output, /public static class UsersItem/)
  assert.match(result.output, /private List<Object> empty;/)
  assert.match(result.output, /private Object unknown;/)
  assert.match(result.output, /private List<Object> mixed;/)
  assert.ok(result.warnings.length >= 3)
})

test('supports Jackson naming, Lombok and package options', () => {
  const result = generateJavaDataClass('{"user-name":"Ada","class":"demo","1stValue":1}', {
    rootClassName: 'api response',
    packageName: 'com.example.model',
    useJackson: true,
    useLombok: true,
  })
  assert.equal(result.fileName, 'ApiResponse.java')
  assert.match(result.output, /^package com\.example\.model;/)
  assert.match(result.output, /import com\.fasterxml\.jackson\.annotation\.JsonProperty;/)
  assert.match(result.output, /import lombok\.Data;/)
  assert.match(result.output, /@JsonProperty\("user-name"\)/)
  assert.match(result.output, /private String userName;/)
  assert.match(result.output, /private String classValue;/)
  assert.match(result.output, /private Integer value1stvalue;/i)
  assert.doesNotMatch(result.output, /getUserName/)
})

test('rejects invalid roots and package names', () => {
  assert.throws(() => generateJavaDataClass('[]'), /空数组无法推断/)
  assert.throws(() => generateJavaDataClass('[{"id":1},2]'), /第 2 个元素不是对象/)
  assert.throws(() => generateJavaDataClass('{}', { packageName: 'bad-package' }), /包名必须/)
})

test('generates plain POJO source that compiles as Java 8', () => {
  const directory = mkdtempSync(join(tmpdir(), 'json-toolbox-java-'))
  try {
    const result = generateJavaDataClass('{"id":1,"items":[{"amount":1.25}]}', {
      rootClassName: 'OrderPayload',
      useJackson: false,
      useLombok: false,
    })
    const source = join(directory, result.fileName)
    writeFileSync(source, result.output)
    execFileSync('javac', ['--release', '8', source], { stdio: 'pipe' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
