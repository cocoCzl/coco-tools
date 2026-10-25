import { ToolError } from './errors.ts'

export type TimestampUnit = 'auto' | 'seconds' | 'milliseconds'
export type TimeZone = 'local' | 'utc'
const invalid = (message: string): never => {
  throw new ToolError('INVALID_TIMESTAMP', message)
}

export function utcOffset(date = new Date()): string {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
export function currentTimeDescription(date = new Date()): string {
  return `${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)} · ${utcOffset(date)}`
}
export function timestampToLocal(
  raw: string,
  unit: TimestampUnit = 'auto',
  zone: TimeZone = 'local',
): string {
  const input = raw.trim()
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(input))
    invalid('请输入有效时间戳；秒可包含最多三位小数，毫秒必须为整数。')
  if (unit === 'auto') {
    const digits = input.replace(/^-/, '')
    if (/^\d{10}$/.test(digits)) unit = 'seconds'
    else if (/^\d{13}$/.test(digits)) unit = 'milliseconds'
    else invalid('自动识别仅适用于 10 位或 13 位数字；此输入有歧义，请选择秒或毫秒。')
  }
  if (input.length > 30) invalid('时间戳超出合理范围。')
  if (unit === 'milliseconds' && input.includes('.')) invalid('毫秒时间戳必须是整数。')
  const [integer, fraction = ''] = input.replace(/^-/, '').split('.')
  const magnitude =
    unit === 'seconds' ? BigInt(integer) * 1000n + BigInt(fraction.padEnd(3, '0')) : BigInt(integer)
  const ms = input.startsWith('-') ? -magnitude : magnitude
  if (ms < -8640000000000000n || ms > 8640000000000000n)
    invalid('时间戳超出 JavaScript 日期支持范围（±8640000000000000 毫秒）。')
  const date = new Date(Number(ms))
  if (zone === 'utc') return `${date.toISOString()} · UTC`
  return `${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' }).format(date)} · 本地 ${utcOffset(date)}`
}
export function localDateTimeToTimestamps(
  dateText: string,
  timeText: string,
  zone: TimeZone = 'local',
): { seconds: string; milliseconds: string } {
  const badDate = () =>
    invalid(
      `请输入有效的${zone === 'utc' ? ' UTC ' : '本地'}日期和时间；本地时间不能落在夏令时跳过的时段。`,
    )
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateText) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(timeText)
  )
    badDate()
  const [year, month, day] = dateText.split('-').map(Number)
  const [clock, fraction = ''] = timeText.split('.')
  const [hour, minute, second = 0] = clock.split(':').map(Number)
  const milliseconds = Number(fraction.padEnd(3, '0'))
  const value = new Date(0)
  if (zone === 'utc') {
    value.setUTCFullYear(year, month - 1, day)
    value.setUTCHours(hour, minute, second, milliseconds)
    if (
      value.getUTCFullYear() !== year ||
      value.getUTCMonth() !== month - 1 ||
      value.getUTCDate() !== day ||
      value.getUTCHours() !== hour ||
      value.getUTCMinutes() !== minute ||
      value.getUTCSeconds() !== second
    )
      badDate()
  } else {
    value.setFullYear(year, month - 1, day)
    value.setHours(hour, minute, second, milliseconds)
    if (
      value.getFullYear() !== year ||
      value.getMonth() !== month - 1 ||
      value.getDate() !== day ||
      value.getHours() !== hour ||
      value.getMinutes() !== minute ||
      value.getSeconds() !== second
    )
      badDate()
  }
  return {
    seconds: String(Math.floor(value.getTime() / 1000)),
    milliseconds: String(value.getTime()),
  }
}
export function localDateInput(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function localTimeInput(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`
}
