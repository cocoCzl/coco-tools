import { ToolError } from './errors.ts'
import { parseJson, type JsonNode, type JsonObjectNode } from './json.ts'

export type TransformResult = {
  output: string
  warnings: string[]
}

function validatePercentEncoding(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%') continue
    if (!/^[0-9a-fA-F]{2}$/.test(value.slice(index + 1, index + 3))) {
      throw new ToolError('INVALID_PERCENT_ENCODING', `位置 ${index + 1} 存在非法或不完整的百分号编码。`)
    }
    index += 2
  }
}

function extractQuery(input: string): string {
  const value = input.trim()
  if (!value) throw new ToolError('EMPTY_INPUT', '请输入 URL 或查询字符串。')
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) {
    try {
      return new URL(value).search.slice(1)
    } catch {
      throw new ToolError('INVALID_URL', '请输入合法的完整 URL。')
    }
  }
  const withoutQuestion = value.startsWith('?') ? value.slice(1) : value
  return withoutQuestion.split('#', 1)[0]
}

function decodePart(value: string): string {
  validatePercentEncoding(value)
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    throw new ToolError('INVALID_UTF8_ENCODING', '查询参数包含无效的 UTF-8 百分号编码。')
  }
}

export function queryToJson(input: string): TransformResult {
  const query = extractQuery(input)
  const values = new Map<string, string[]>()
  if (query) {
    for (const pair of query.split('&')) {
      const separator = pair.indexOf('=')
      const rawKey = separator < 0 ? pair : pair.slice(0, separator)
      const rawValue = separator < 0 ? '' : pair.slice(separator + 1)
      const key = decodePart(rawKey)
      const value = decodePart(rawValue)
      const existing = values.get(key)
      if (existing) existing.push(value)
      else values.set(key, [value])
    }
  }
  const result: Record<string, string | string[]> = {}
  for (const [key, items] of values) result[key] = items.length === 1 ? items[0] : items
  return { output: JSON.stringify(result, null, 2), warnings: [] }
}

function primitiveText(node: JsonNode): string | undefined {
  if (node.kind === 'string') return node.value
  if (node.kind === 'number') return node.raw
  if (node.kind === 'boolean') return node.value ? 'true' : 'false'
  if (node.kind === 'null') return 'null'
  return undefined
}

function requireObject(node: JsonNode): JsonObjectNode {
  if (node.kind !== 'object') {
    throw new ToolError('QUERY_ROOT_OBJECT', 'JSON 转 URL 参数时，根节点必须是对象。')
  }
  return node
}

export function jsonToQuery(input: string): TransformResult {
  const root = requireObject(parseJson(input))
  const params = new URLSearchParams()
  const warnings: string[] = []
  for (const entry of root.entries) {
    const primitive = primitiveText(entry.value)
    if (primitive !== undefined) {
      params.append(entry.key, primitive)
      continue
    }
    if (entry.value.kind === 'object') {
      throw new ToolError('NESTED_QUERY_OBJECT', `字段“${entry.key}”是嵌套对象，无法无歧义地转换为查询参数。`)
    }
    if (entry.value.kind !== 'array') {
      throw new ToolError('UNSUPPORTED_QUERY_VALUE', `字段“${entry.key}”包含不支持的值。`)
    }
    if (entry.value.items.length === 0) {
      warnings.push(`字段“${entry.key}”是空数组，已跳过。`)
      continue
    }
    for (const item of entry.value.items) {
      const text = primitiveText(item)
      if (text === undefined) {
        throw new ToolError('NESTED_QUERY_ARRAY', `字段“${entry.key}”包含对象或嵌套数组，暂不支持。`)
      }
      params.append(entry.key, text)
    }
  }
  return { output: params.toString(), warnings }
}
