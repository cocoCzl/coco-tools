import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { timestampToLocal, localDateTimeToTimestamps } from '../src/core/timestamp.ts'

test('时间戳显式单位支持零、短秒数、负数和毫秒精度', () => {
  assert.equal(timestampToLocal('0', 'seconds', 'utc'), '1970-01-01T00:00:00.000Z · UTC')
  assert.equal(timestampToLocal('-1', 'seconds', 'utc'), '1969-12-31T23:59:59.000Z · UTC')
  assert.equal(timestampToLocal('-0.001', 'seconds', 'utc'), '1969-12-31T23:59:59.999Z · UTC')
  assert.equal(timestampToLocal('123', 'seconds', 'utc'), '1970-01-01T00:02:03.000Z · UTC')
  assert.equal(timestampToLocal('1', 'milliseconds', 'utc'), '1970-01-01T00:00:00.001Z · UTC')
  for (const input of ['0', '123', '-1', '12345678901'])
    assert.throws(() => timestampToLocal(input), /歧义.*选择/)
  for (const input of ['abc', '1e3', '1.2345', 'NaN', 'Infinity', ''])
    assert.throws(() => timestampToLocal(input, 'seconds'), /有效时间戳/)
  assert.throws(() => timestampToLocal('1.1', 'milliseconds'), /整数/)
  assert.throws(() => timestampToLocal('8640000000000001', 'milliseconds'), /超出/)
  assert.match(timestampToLocal('8640000000000000', 'milliseconds', 'utc'), /275760/)
  assert.match(timestampToLocal('-8640000000000000', 'milliseconds', 'utc'), /271821/)
})

test('日期输入校验、UTC 与毫秒精度，包括 0–99 年', () => {
  assert.deepEqual(localDateTimeToTimestamps('1970-01-01', '00:00:00.123', 'utc'), {
    seconds: '0',
    milliseconds: '123',
  })
  assert.equal(localDateTimeToTimestamps('1969-12-31', '23:59:59.999', 'utc').seconds, '-1')
  assert.equal(
    timestampToLocal(
      localDateTimeToTimestamps('0001-01-01', '00:00', 'utc').milliseconds,
      'milliseconds',
      'utc',
    ),
    '0001-01-01T00:00:00.000Z · UTC',
  )
  for (const [date, time] of [
    ['2024-02-31', '00:00'],
    ['2023-02-29', '00:00'],
    ['2024-13-01', '00:00'],
    ['2024-01-01', '24:00'],
    ['2024-01-01', '00:00:60'],
  ])
    assert.throws(() => localDateTimeToTimestamps(date, time, 'utc'), /有效/)
})

test('夏令时跳过时段拒绝，重复时段选择较早时刻，UTC 不受影响', () => {
  const script = `import assert from 'node:assert/strict';
import { localDateTimeToTimestamps as convert } from './src/core/timestamp.ts';
assert.throws(() => convert('2024-03-10','02:30:00'), /夏令时/);
assert.equal(convert('2024-11-03','01:30:00').milliseconds, String(Date.parse('2024-11-03T05:30:00Z')));
assert.equal(convert('2024-03-10','02:30:00','utc').milliseconds, String(Date.parse('2024-03-10T02:30:00Z')));`
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ: 'America/New_York' } },
  )
})
