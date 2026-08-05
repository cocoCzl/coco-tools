import { ConverterError } from './operations.ts'

const timestampPattern = /^(?:\d{10}|\d{13})$/

export function utcOffset(date = new Date()): string {
  const minutes = -date.getTimezoneOffset(); const sign = minutes >= 0 ? '+' : '-'; const absolute = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
export function currentTimeDescription(date = new Date()): string { return `${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)} · ${utcOffset(date)}` }
export function timestampToLocal(raw: string): string {
  const input = raw.trim(); if (!input) throw new ConverterError('请输入 10 位或 13 位数字时间戳。'); if (!timestampPattern.test(input)) throw new ConverterError('请输入 10 位或 13 位数字时间戳。')
  const date = new Date(Number(input) * (input.length === 10 ? 1000 : 1)); if (Number.isNaN(date.getTime())) throw new ConverterError('无效时间戳。')
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
}
export function localDateTimeToTimestamps(dateText: string, timeText: string): { seconds: string; milliseconds: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(timeText)) throw new ConverterError('请输入有效的本地日期和时间。')
  const [year, month, day] = dateText.split('-').map(Number); const [hour, minute, second = 0] = timeText.split(':').map(Number); const value = new Date(year, month - 1, day, hour, minute, second)
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day || value.getHours() !== hour || value.getMinutes() !== minute || value.getSeconds() !== second) throw new ConverterError('请输入有效的本地日期和时间。')
  return { seconds: String(Math.floor(value.getTime() / 1000)), milliseconds: String(value.getTime()) }
}
export function localDateInput(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
export function localTimeInput(date = new Date()): string { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}` }
