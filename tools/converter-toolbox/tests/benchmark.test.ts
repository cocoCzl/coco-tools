import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { caseFailures, type CaseMetrics } from '../scripts/benchmark.mts'

const mib = 1024 * 1024
const metrics = (bytes: number, overrides: Partial<CaseMetrics> = {}): CaseMetrics => ({
  name: 'yaml-json',
  elapsed: 100,
  heap: 20 * mib,
  inputBytes: bytes - 20,
  outputBytes: bytes,
  ...overrides,
})

test('性能门槛按单次转换执行，时间与内存边界均包含等号', () => {
  for (const [bytes, limit] of [
    [1_000_000, 200],
    [10_000_000, 2_000],
    [20_000_000, 2_000],
  ]) {
    assert.deepEqual(
      caseFailures('yaml-json', bytes, metrics(bytes, { elapsed: limit, heap: 200 * mib })),
      [],
    )
    assert.match(
      caseFailures('yaml-json', bytes, metrics(bytes, { elapsed: limit + 1 }))[0],
      /单次转换门槛/,
    )
    assert.match(
      caseFailures('yaml-json', bytes, metrics(bytes, { heap: 200 * mib + 1 }))[0],
      /增量堆门槛/,
    )
  }
})

test('独立操作不相加判定，任一操作超标仍失败且可汇总多个原因', () => {
  const names = ['format', 'java', 'yaml-json', 'json-yaml']
  assert.deepEqual(
    names.flatMap((name) =>
      caseFailures(name, 1_000_000, metrics(1_000_000, { name, elapsed: 199 })),
    ),
    [],
  )
  const failures = names.flatMap((name) =>
    caseFailures(
      name,
      1_000_000,
      metrics(1_000_000, {
        name,
        elapsed: name === 'java' ? 201 : 199,
        heap: name === 'java' ? 201 * mib : 20 * mib,
      }),
    ),
  )
  assert.equal(failures.length, 2)
  assert.ok(failures.every((message) => message.includes('java')))
})

test('无效指标、错误操作、缩小样本和空输出不能冒充性能通过', () => {
  for (const overrides of [
    { name: 'format' },
    { elapsed: NaN },
    { elapsed: -1 },
    { heap: Infinity },
    { heap: -1 },
    { inputBytes: 100 },
    { inputBytes: NaN },
    { outputBytes: 0 },
    { outputBytes: 41 * mib },
  ]) {
    assert.match(
      caseFailures('yaml-json', 1_000_000, metrics(1_000_000, overrides))[0],
      /无效测量结果/,
    )
  }
})

test('性能子进程拒绝未知操作与非法样本规模，不返回空成功结果', () => {
  const script = fileURLToPath(new URL('../scripts/performance-case.mts', import.meta.url))
  for (const args of [
    ['typo', '1000000'],
    ['yaml-json', '0'],
    ['yaml-json', '100'],
  ]) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], {
      encoding: 'utf8',
    })
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /请指定受支持的转换操作/)
  }
})
