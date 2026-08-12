import { ToolError } from './errors.ts'
import { locate } from './lossless-json.ts'
import { MAX_NESTING_DEPTH } from './limits.ts'

export class RawNumber {
  readonly raw: string
  constructor(raw: string) { this.raw = raw }
}
export type CompactJson = null | boolean | string | RawNumber | CompactJson[] | { [key: string]: CompactJson }

/** JSON parser for semantic conversions: retains raw numbers without a location-heavy syntax tree. */
export function parseCompactJson(source: string): CompactJson {
  let index = 0
  const failAt = (code: string, message: string, at = index): never => { throw new ToolError(code, message, locate(source, at)) }
  const whitespace = () => { while (source[index] === ' ' || source[index] === '\t' || source[index] === '\r' || source[index] === '\n') index += 1 }
  const string = (): string => {
    const start = index++
    while (index < source.length) {
      const char = source[index]
      if (char === '"') { index += 1; try { return JSON.parse(source.slice(start, index)) as string } catch { failAt('INVALID_STRING', '字符串包含无效 Unicode 转义。', start) } }
      if (source.charCodeAt(index) < 0x20) failAt('CONTROL_CHARACTER', '字符串中包含未转义的控制字符。')
      if (char === '\\') {
        index += 1; const escape = source[index]
        if (escape === undefined) failAt('UNEXPECTED_END', '字符串转义意外结束。')
        if ('"\\/bfnrt'.includes(escape)) { index += 1; continue }
        if (escape === 'u' && /^[0-9a-fA-F]{4}$/.test(source.slice(index + 1, index + 5))) { index += 5; continue }
        failAt('INVALID_ESCAPE', `不支持的转义序列“\\${escape}”。`)
      }
      index += 1
    }
    failAt('UNTERMINATED_STRING', '字符串缺少结束双引号。', start)
    throw new Error('unreachable')
  }
  const number = (): RawNumber => {
    const start = index
    if (source[index] === '-') index += 1
    if (source[index] === '0') { index += 1; if (/\d/.test(source[index] ?? '')) failAt('LEADING_ZERO', '数字不能包含多余的前导零。') }
    else { if (!/[1-9]/.test(source[index] ?? '')) failAt('INVALID_NUMBER', '负号后必须是数字。'); while (/\d/.test(source[index] ?? '')) index += 1 }
    if (source[index] === '.') { index += 1; if (!/\d/.test(source[index] ?? '')) failAt('INVALID_NUMBER', '小数点后必须包含数字。'); while (/\d/.test(source[index] ?? '')) index += 1 }
    if (source[index] === 'e' || source[index] === 'E') { index += 1; if (source[index] === '+' || source[index] === '-') index += 1; if (!/\d/.test(source[index] ?? '')) failAt('INVALID_NUMBER', '指数部分必须包含数字。'); while (/\d/.test(source[index] ?? '')) index += 1 }
    return new RawNumber(source.slice(start, index))
  }
  const value = (depth: number): CompactJson => {
    if (depth > MAX_NESTING_DEPTH) failAt('MAX_DEPTH_EXCEEDED', `JSON 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`)
    const char = source[index]
    if (char === '"') return string()
    if (char === '-' || /\d/.test(char ?? '')) return number()
    for (const [raw, result] of [['true', true], ['false', false], ['null', null]] as const) if (source.slice(index, index + raw.length) === raw) { index += raw.length; return result }
    if (char === '[') {
      index += 1; whitespace(); const result: CompactJson[] = []
      if (source[index] === ']') { index += 1; return result }
      while (true) { result.push(value(depth + 1)); whitespace(); if (source[index] === ']') { index += 1; return result }; if (source[index] !== ',') failAt('EXPECTED_COMMA', '数组元素之间缺少逗号。'); index += 1; whitespace(); if (source[index] === ']') failAt('TRAILING_COMMA', '数组末尾不能包含多余逗号。') }
    }
    if (char === '{') {
      index += 1; whitespace(); const result: { [key: string]: CompactJson } = Object.create(null)
      if (source[index] === '}') { index += 1; return result }
      while (true) { if (source[index] !== '"') failAt('OBJECT_KEY', '对象字段名必须是双引号字符串。'); const keyAt = index; const key = string(); if (Object.hasOwn(result, key)) failAt('DUPLICATE_KEY', `字段“${key}”重复出现。`, keyAt); whitespace(); if (source[index] !== ':') failAt('EXPECTED_COLON', '字段名后缺少冒号。'); index += 1; whitespace(); result[key] = value(depth + 1); whitespace(); if (source[index] === '}') { index += 1; return result }; if (source[index] !== ',') failAt('EXPECTED_COMMA', '对象字段之间缺少逗号。'); index += 1; whitespace(); if (source[index] === '}') failAt('TRAILING_COMMA', '对象末尾不能包含多余逗号。') }
    }
    if (char === undefined) failAt('UNEXPECTED_END', 'JSON 意外结束。')
    failAt('UNEXPECTED_TOKEN', `无法识别的字符“${char}”。`)
    throw new Error('unreachable')
  }
  whitespace(); if (index >= source.length) failAt('EMPTY_INPUT', '请输入 JSON。')
  const result = value(0); whitespace(); if (index !== source.length) failAt('TRAILING_CONTENT', 'JSON 根节点结束后存在多余内容。')
  return result
}

export function isCompactObject(value: CompactJson): value is { [key: string]: CompactJson } {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof RawNumber)
}

export function visitRootObjects(source: string, accept: (value: { [key: string]: CompactJson }, index: number) => void): void {
  const trimmed = source.trim()
  if (trimmed.startsWith('{')) {
    const value = parseCompactJson(trimmed)
    if (!isCompactObject(value)) throw new ToolError('JAVA_ROOT_OBJECT', '生成 Java 数据类时，根节点必须是对象或对象数组。')
    accept(value, 0); return
  }
  if (!trimmed.startsWith('[')) throw new ToolError('JAVA_ROOT_OBJECT', '生成 Java 数据类时，根节点必须是对象或对象数组。')
  let start = 1; let depth = 1; let quote = false; let escaped = false; let count = 0
  const consume = (end: number) => {
    const raw = trimmed.slice(start, end).trim()
    if (!raw) throw new ToolError(count ? 'TRAILING_COMMA' : 'EMPTY_ROOT_ARRAY', count ? '数组末尾不能包含多余逗号。' : '空数组无法推断 Java 数据类。')
    const value = parseCompactJson(raw)
    if (!isCompactObject(value)) throw new ToolError('MIXED_ROOT_ARRAY', `根数组第 ${count + 1} 个元素不是对象，无法生成数据类。`)
    accept(value, count++)
  }
  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quote = false; continue }
    if (char === '"') { quote = true; continue }
    if (char === '[' || char === '{') { depth += 1; if (depth > MAX_NESTING_DEPTH + 1) throw new ToolError('MAX_DEPTH_EXCEEDED', `JSON 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`); continue }
    if (char === ']' || char === '}') {
      depth -= 1
      if (depth === 0) { if (char !== ']') throw new ToolError('EXPECTED_COMMA', '根数组结构无效。'); if (trimmed.slice(index + 1).trim()) throw new ToolError('TRAILING_CONTENT', 'JSON 根节点结束后存在多余内容。'); if (trimmed.slice(start, index).trim()) consume(index); else if (!count) throw new ToolError('EMPTY_ROOT_ARRAY', '空数组无法推断 Java 数据类。'); return }
      if (depth < 0) throw new ToolError('EXPECTED_COMMA', '根数组结构无效。')
      continue
    }
    if (char === ',' && depth === 1) { consume(index); start = index + 1 }
  }
  throw new ToolError('UNEXPECTED_END', 'JSON 意外结束。')
}
