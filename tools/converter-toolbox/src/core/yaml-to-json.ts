import { ToolError } from './errors.ts'
import { formatJson, locate } from './lossless-json.ts'
import { LimitedWriter, MAX_NESTING_DEPTH } from './limits.ts'

type Line = { number: number; indent: number; text: string; start: number }

/** One streaming parser shared by YAML conversion and formatting. No numeric coercion. */
export function yamlSubsetToJson(source: string): string {
  const writer = new LimitedWriter()
  let cursor = 0
  let lineNumber = 0
  let current: Line | undefined
  const fail = (line: Line, column: number, message: string): never => {
    throw new ToolError('YAML_SUBSET', message, {
      index: line.start + column - 1,
      line: line.number,
      column,
    })
  }
  const next = (): Line | undefined => {
    while (cursor <= source.length) {
      const start = cursor
      const end = source.indexOf('\n', cursor)
      const stop = end < 0 ? source.length : end
      let raw = source.slice(cursor, stop)
      cursor = end < 0 ? source.length + 1 : end + 1
      lineNumber += 1
      if (raw.endsWith('\r')) raw = raw.slice(0, -1)
      if (lineNumber === 1 && raw.startsWith('\uFEFF')) raw = ` ${raw.slice(1)}`
      const prefix = raw.match(/^\s*/)?.[0] ?? ''
      if (prefix.includes('\t'))
        fail(
          { number: lineNumber, start, indent: 0, text: raw },
          prefix.indexOf('\t') + 1,
          'YAML 缩进不能使用 Tab。',
        )
      const clean = uncomment(raw).trimEnd()
      if (!clean.trim()) continue
      const indent = clean.length - clean.trimStart().length
      const text = clean.slice(indent)
      const line = { number: lineNumber, indent, text, start }
      if (/^(---|\.\.\.)(?:\s|$)/.test(text)) fail(line, indent + 1, 'YAML 多文档暂不支持。')
      return line
    }
  }
  const advance = () => {
    current = next()
  }
  const scalar = (value: string, line: Line, column: number, depth = 0): string => {
    if (/^[&*!]/.test(value)) fail(line, column, 'YAML 锚点、别名和标签暂不支持。')
    if (/^[|>]/.test(value)) fail(line, column, 'YAML 块文本暂不支持。')
    if (value.startsWith('"') || value.startsWith('[') || value.startsWith('{')) {
      try {
        return formatJson(value, 2, MAX_NESTING_DEPTH - depth)
      } catch (error) {
        if (error instanceof ToolError) {
          const offset = line.start + column - 1 + (error.location?.index ?? 0)
          throw new ToolError(
            error.code,
            `流式集合与双引号字符串仅支持严格 JSON 写法：${error.message}`,
            locate(source, offset),
          )
        }
        throw error
      }
    }
    if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) fail(line, column, '单引号字符串无效。')
      return JSON.stringify(value.slice(1, -1).replace(/''/g, "'"))
    }
    if (/^(?:null|~)$/i.test(value)) return 'null'
    if (/^(?:true|false)$/i.test(value)) return value.toLowerCase()
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return value
    if (/^(?:yes|no|on|off|\.nan|[+-]?\.inf)$/i.test(value))
      fail(line, column, 'YAML 隐式类型不属于 JSON 兼容子集。')
    if (/^[?%@`\]}]/.test(value) || findColon(value) >= 0)
      fail(line, column, '此语法不属于 JSON 兼容 YAML 安全子集，请为普通文本加引号。')
    return JSON.stringify(value)
  }
  const entry = (line: Line) => {
    const at = findColon(line.text)
    if (at < 0) fail(line, line.indent + 1, '映射项必须包含冒号。')
    const raw = line.text.slice(0, at).trim()
    if (!raw || raw.startsWith('[') || raw.startsWith('{') || raw.startsWith('?'))
      fail(line, line.indent + 1, '复杂 YAML 键暂不支持。')
    if (raw === '<<') fail(line, line.indent + 1, 'YAML 合并键暂不支持。')
    const json = scalar(raw, line, line.indent + 1)
    // Only string tokens may be keys. JSON.parse here never sees a numeric token.
    if (!json.startsWith('"'))
      fail(line, line.indent + 1, 'YAML 映射键必须是字符串；请为数字或布尔值形式的键加引号。')
    const key = JSON.parse(json) as string
    const tail = line.text.slice(at + 1)
    return {
      key,
      value: tail.trimStart(),
      column: line.indent + at + 2 + tail.length - tail.trimStart().length,
    }
  }
  const separator = (depth: number, first: boolean) => {
    if (!first) writer.write(',')
    writer.write(`\n${'  '.repeat(depth + 1)}`)
  }
  const writeScalar = (raw: string, line: Line, column: number, depth: number) => {
    const json = scalar(raw, line, column, depth)
    writer.write(json.includes('\n') ? json.replace(/\n/g, `\n${'  '.repeat(depth)}`) : json)
  }
  const block = (indent: number, depth: number): void => {
    if (depth > MAX_NESTING_DEPTH)
      fail(current!, current!.indent + 1, `YAML 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`)
    const line = current!
    if (depth === MAX_NESTING_DEPTH && (isSequence(line.text) || findColon(line.text) >= 0))
      fail(line, line.indent + 1, `YAML 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`)
    if (isSequence(line.text)) sequence(indent, depth)
    else if (findColon(line.text) >= 0) mapping(indent, depth)
    else {
      advance()
      writeScalar(line.text, line, line.indent + 1, depth)
    }
  }
  const mapping = (indent: number, depth: number, firstLine?: Line): void => {
    if (depth >= MAX_NESTING_DEPTH)
      fail(firstLine ?? current!, indent + 1, `YAML 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`)
    writer.write('{')
    let first = true
    const keys = new Set<string>()
    let line = firstLine
    while (line || (current && current.indent === indent && !isSequence(current.text))) {
      const item = line ?? current!
      const parsed = entry(item)
      if (keys.has(parsed.key)) fail(item, item.indent + 1, `重复键“${parsed.key}”不受支持。`)
      keys.add(parsed.key)
      if (!line) advance()
      line = undefined
      separator(depth, first)
      first = false
      writer.write(JSON.stringify(parsed.key))
      writer.write(': ')
      if (parsed.value) writeScalar(parsed.value, item, parsed.column, depth + 1)
      else if (current && current.indent > indent) block(current.indent, depth + 1)
      else writer.write('null')
      if (current && current.indent > indent) fail(current, current.indent + 1, '缩进层级不正确。')
    }
    if (!first) writer.write(`\n${'  '.repeat(depth)}`)
    writer.write('}')
  }
  const sequence = (indent: number, depth: number): void => {
    writer.write('[')
    let first = true
    while (current && current.indent === indent && isSequence(current.text)) {
      const item = current
      const value = item.text.slice(1).trimStart()
      const column = item.indent + item.text.length - value.length + 1
      advance()
      separator(depth, first)
      first = false
      if (!value) {
        if (current && current.indent > indent) block(current.indent, depth + 1)
        else writer.write('null')
      } else if (findColon(value) >= 0)
        mapping(indent + 2, depth + 1, { ...item, indent: column - 1, text: value })
      else writeScalar(value, item, column, depth + 1)
      if (current && current.indent > indent)
        fail(current, current.indent + 1, '序列项缩进不正确。')
    }
    if (!first) writer.write(`\n${'  '.repeat(depth)}`)
    writer.write(']')
  }
  // YAML is a superset of JSON: accept multiline strict JSON roots too.
  const trimmed = source.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const firstLine = uncomment(trimmed.split('\n', 1)[0]).trimEnd()
    if (firstLine.endsWith('}') || firstLine.endsWith(']')) {
      advance()
      const line = current!
      advance()
      if (current) fail(current, current.indent + 1, 'YAML 根节点结束后存在多余内容。')
      writeScalar(line.text, line, line.indent + 1, 0)
      return writer.finish()
    }
    return formatJson(source)
  }
  advance()
  if (!current)
    throw new ToolError('YAML_SUBSET', '请输入 YAML。', { index: 0, line: 1, column: 1 })
  block(current.indent, 0)
  if (current) fail(current, current.indent + 1, 'YAML 结构不完整。')
  return writer.finish()
}

function isSequence(text: string): boolean {
  return text === '-' || text.startsWith('- ')
}

/** Scan only syntactic quotes, honoring backslash parity and doubled single quotes. */
function scan(
  text: string,
  visit: (char: string, index: number, depth: number) => boolean,
): number {
  let quote = ''
  let depth = 0
  let tokenStart = true
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (quote === '"' && char === '\\') {
        index += 1
        continue
      }
      if (char === quote) {
        if (quote === "'" && text[index + 1] === "'") {
          index += 1
          continue
        }
        quote = ''
      }
      continue
    }
    if ((char === '"' || char === "'") && tokenStart) {
      quote = char
      tokenStart = false
      continue
    }
    if (visit(char, index, depth)) return index
    if ((char === '[' || char === '{') && (tokenStart || depth > 0)) {
      depth += 1
      tokenStart = true
    } else if ((char === ']' || char === '}') && depth > 0) {
      depth -= 1
      tokenStart = false
    } else if (
      (char === ',' && depth > 0) ||
      (char === ':' && (depth > 0 || index + 1 === text.length || /\s/.test(text[index + 1])))
    )
      tokenStart = true
    else if (char === '-' && tokenStart && /\s/.test(text[index + 1] ?? '')) tokenStart = true
    else if (tokenStart && char !== ' ' && char !== '\t') tokenStart = false
  }
  return -1
}
function findColon(text: string): number {
  return scan(
    text,
    (char, index, depth) =>
      depth === 0 && char === ':' && (index + 1 === text.length || /\s/.test(text[index + 1])),
  )
}
function uncomment(text: string): string {
  const at = scan(
    text,
    (char, index) => char === '#' && (index === 0 || /\s/.test(text[index - 1])),
  )
  return at < 0 ? text : text.slice(0, at)
}
