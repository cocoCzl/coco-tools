import { formatJson as formatLosslessJson, minifyJson as minifyLosslessJson } from './lossless-json.ts'
import { generateJavaDataClass } from './java.ts'
import { parseYamlSubset, stringifyYamlSubset } from './yaml-subset.ts'
import { assertInputLimit, assertOutputLimit, LimitedWriter } from './limits.ts'
import type { OperationId, OperationOptions } from './protocol.ts'
import { yamlSubsetToJson } from './yaml-to-json.ts'

export type Result = { output: string; warnings?: string[]; fileName?: string }

export class ConverterError extends Error {
  constructor(message: string) { super(message); this.name = 'ConverterError' }
}

function jsonError(error: unknown): never {
  if (error instanceof SyntaxError) {
    const position = /position (\d+)/.exec(error.message)?.[1]
    throw new ConverterError(`JSON 格式错误${position ? `（位置 ${position}）` : ''}：${error.message}`)
  }
  throw error
}

function parseJson(input: string): unknown {
  if (!input.trim()) throw new ConverterError('请输入 JSON。')
  try { return JSON.parse(input) } catch (error) { return jsonError(error) }
}

export function formatJson(input: string, indent: 2 | 4 | 'tab' = 2): Result {
  try { return { output: formatLosslessJson(input, indent) } } catch (error) { throw displayJsonError(error) }
}

export function minifyJson(input: string): Result { try { return { output: minifyLosslessJson(input) } } catch (error) { throw displayJsonError(error) } }

function displayJsonError(error: unknown): Error {
  if (error && typeof error === 'object' && 'message' in error && 'location' in error) {
    const location = (error as { location?: { line: number; column: number } }).location
    if (location) return new ConverterError(`第 ${location.line} 行，第 ${location.column} 列：${String((error as { message: unknown }).message)}`)
  }
  return error instanceof Error ? error : new ConverterError('发生未知错误。')
}

export function escapeJson(input: string, escapeNonAscii = false): Result {
  if (!escapeNonAscii) return { output: JSON.stringify(input) }
  const writer = new LimitedWriter(); writer.write('"')
  for (const char of input) {
    const encoded = JSON.stringify(char).slice(1, -1)
    if (char.codePointAt(0)! >= 0x80) for (let index = 0; index < char.length; index += 1) writer.write(`\\u${char.charCodeAt(index).toString(16).padStart(4, '0')}`)
    else writer.write(encoded)
  }
  writer.write('"')
  return { output: writer.finish() }
}

export function unescapeJson(input: string): Result {
  const value = parseJson(input)
  if (typeof value !== 'string') throw new ConverterError('反转义输入必须是包含外层双引号的 JSON 字符串。')
  return { output: value }
}

function decode(value: string): string {
  for (let index = 0; index < value.length; index += 1) if (value[index] === '%' && !/^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) throw new ConverterError(`位置 ${index + 1} 存在非法百分号编码。`)
  try { return decodeURIComponent(value.replace(/\+/g, ' ')) } catch { throw new ConverterError('查询参数包含无效的 UTF-8 百分号编码。') }
}

export function queryToJson(input: string): Result {
  const text = input.trim(); if (!text) throw new ConverterError('请输入 URL 或查询字符串。')
  let query = text
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) { try { query = new URL(text).search.slice(1) } catch { throw new ConverterError('请输入合法的完整 URL。') } }
  else query = (text.startsWith('?') ? text.slice(1) : text).split('#', 1)[0]
  const output: Record<string, string | string[]> = {}
  for (const pair of query ? query.split('&') : []) { const at = pair.indexOf('='); const key = decode(at < 0 ? pair : pair.slice(0, at)); const value = decode(at < 0 ? '' : pair.slice(at + 1)); const old = output[key]; if (old === undefined) output[key] = value; else if (Array.isArray(old)) old.push(value); else output[key] = [old, value] }
  return { output: JSON.stringify(output, null, 2) }
}

export function jsonToQuery(input: string): Result {
  const data = parseJson(input)
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new ConverterError('JSON 转 URL 参数时，根节点必须是对象。')
  const params = new URLSearchParams(); const warnings: string[] = []
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const values = Array.isArray(value) ? value : [value]
    if (Array.isArray(value) && value.length === 0) { warnings.push(`字段“${key}”是空数组，已跳过。`); continue }
    for (const item of values) { if (item !== null && typeof item === 'object') throw new ConverterError(`字段“${key}”包含嵌套对象或数组，暂不支持。`); params.append(key, item === null ? 'null' : String(item)) }
  }
  return { output: params.toString(), warnings }
}

export function yamlToJson(input: string): Result {
  if (!input.trim()) throw new ConverterError('请输入 YAML。')
  try { JSON.parse(input); throw new ConverterError('检测到 JSON 输入，请使用“JSON → YAML”。') } catch (error) { if (error instanceof ConverterError) throw error }
  try { return { output: yamlSubsetToJson(input) } } catch (error) { throw displayJsonError(error) }
}

export function jsonToYaml(input: string): Result { return { output: stringifyYamlSubset(parseJson(input)) } }
export function formatYaml(input: string): Result { return { output: stringifyYamlSubset(parseYamlSubset(input)) } }

const javaKeywords = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'record', 'var'])
function javaName(value: string, fallback: string, className = false) { const parts = value.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean); let output = parts.map((part, index) => className || index > 0 ? part[0].toUpperCase() + part.slice(1) : part[0].toLowerCase() + part.slice(1)).join('') || fallback; if (!/^[$_\p{L}]/u.test(output)) output = `${className ? 'Value' : 'value'}${output}`; if (javaKeywords.has(output)) output += 'Value'; return output }
export function generateJava(input: string, options: { rootClassName?: string; packageName?: string; lombok?: boolean; jackson?: boolean } = {}): Result {
  return generateJavaDataClass(input, options)
}

export function runOperation(operation: OperationId, input: string, options: OperationOptions = {}): Result {
  assertInputLimit(input)
  let result: Result
  switch (operation) {
    case 'format': result = formatJson(input, options.indent === '4' || options.indent === 'tab' ? (options.indent === '4' ? 4 : options.indent) : 2); break
    case 'minify': result = minifyJson(input); break
    case 'escape': result = escapeJson(input, options.escapeNonAscii === true); break
    case 'unescape': result = unescapeJson(input); break
    case 'query': result = queryToJson(input); break
    case 'url': result = jsonToQuery(input); break
    case 'json-yaml': result = jsonToYaml(input); break
    case 'yaml-json': result = yamlToJson(input); break
    case 'yaml-format': result = formatYaml(input); break
    case 'java': result = generateJava(input, options); break
    default: throw new ConverterError('未知转换操作。')
  }
  assertOutputLimit(result.output)
  return result
}
