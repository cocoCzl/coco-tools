import { ToolError } from './errors.ts'
import { LimitedWriter, MAX_NESTING_DEPTH } from './limits.ts'

type Line = { number: number; indent: number; text: string }

export function yamlSubsetToJson(source: string): string {
  if (/(^|\s)[&*][\w-]+|(^|\s)!\S|(^|\s)<<\s*:|(^|\n)\s*(?:---|\.\.\.)(?:\s|$)|(^|\n)\s*(?:[^\n:]+:\s*)?[|>][-+]?\s*(?:\n|$)/m.test(source)) throw new ToolError('YAML_SUBSET', 'YAML 锚点、别名、标签、合并键、多文档和块文本暂不支持。', { index: 0, line: 1, column: 1 })
  const writer = new LimitedWriter(); let cursor = 0; let lineNumber = 0; let current: Line | undefined
  const fail = (line: number, column: number, message: string): never => { throw new ToolError('YAML_SUBSET', message, { index: 0, line, column }) }
  const next = (): Line | undefined => {
    while (cursor <= source.length) {
      const end = source.indexOf('\n', cursor); const stop = end < 0 ? source.length : end
      let raw = source.slice(cursor, stop); cursor = end < 0 ? source.length + 1 : end + 1; lineNumber += 1
      if (raw.endsWith('\r')) raw = raw.slice(0, -1)
      if (lineNumber === 1 && raw.startsWith('\uFEFF')) raw = raw.slice(1)
      if (/\t/.test(raw.match(/^\s*/)?.[0] ?? '')) fail(lineNumber, 1, 'YAML 缩进不能使用 Tab。')
      const clean = uncomment(raw).trimEnd(); if (!clean.trim()) continue
      const indent = clean.length - clean.trimStart().length; const text = clean.slice(indent)
      if (/^(---|\.\.\.)(?:\s|$)/.test(text)) fail(lineNumber, indent + 1, 'YAML 多文档暂不支持。')
      if (/(^|\s)[&*][\w-]+|(^|\s)!\S|(^|\s)<<\s*:/.test(text)) fail(lineNumber, indent + 1, 'YAML 锚点、别名、标签和合并键暂不支持。')
      if (/^[|>][-+]?/.test(text) || /:\s*[|>][-+]?\s*$/.test(text)) fail(lineNumber, indent + 1, 'YAML 块文本暂不支持。')
      return { number: lineNumber, indent, text }
    }
  }
  const advance = () => { current = next() }
  const scalar = (raw: string, line: number, column: number): string => {
    const value = raw.trim()
    if (value.startsWith('"')) { try { const parsed = JSON.parse(value); if (typeof parsed !== 'string') throw new Error(); return JSON.stringify(parsed) } catch { fail(line, column, '双引号字符串无效。') } }
    if (value.startsWith("'")) { if (!value.endsWith("'") || value.length === 1) fail(line, column, '单引号字符串无效。'); return JSON.stringify(value.slice(1, -1).replace(/''/g, "'")) }
    if (value.startsWith('[') || value.startsWith('{')) { try { return JSON.stringify(JSON.parse(value), null, 2) } catch { fail(line, column, '流式集合仅支持严格 JSON 写法。') } }
    if (/^(?:null|~)$/i.test(value)) return 'null'
    if (/^(?:true|false)$/i.test(value)) return value.toLowerCase()
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return value
    if (/^(?:yes|no|on|off|\.nan|[+-]?\.inf)$/i.test(value)) fail(line, column, 'YAML 隐式类型不属于 JSON 兼容子集。')
    return JSON.stringify(value)
  }
  const findColon = (text: string): number => { let quote = ''; for (let index = 0; index < text.length; index += 1) { const char = text[index]; if (quote) { if (char === quote && text[index - 1] !== '\\') quote = ''; continue }; if (char === '"' || char === "'") quote = char; else if (char === ':' && (index + 1 === text.length || /\s/.test(text[index + 1]))) return index }; return -1 }
  const entry = (line: Line) => { const at = findColon(line.text); if (at < 0) fail(line.number, line.indent + 1, '映射项必须包含冒号。'); const raw = line.text.slice(0, at).trim(); if (!raw || raw.startsWith('[') || raw.startsWith('{')) fail(line.number, line.indent + 1, '复杂 YAML 键暂不支持。'); const json = scalar(raw, line.number, line.indent + 1); const key = JSON.parse(json); if (typeof key !== 'string') fail(line.number, line.indent + 1, 'YAML 映射键必须是字符串。'); return { key, value: line.text.slice(at + 1).trim(), column: line.indent + 1 } }
  const separator = (depth: number, first: boolean) => { if (!first) writer.write(','); writer.write(`\n${'  '.repeat(depth + 1)}`) }
  const block = (indent: number, depth: number): void => { if (depth > MAX_NESTING_DEPTH) fail(current?.number ?? 1, 1, `YAML 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`); const line = current; if (!line || line.indent < indent) fail(line?.number ?? 1, 1, '缺少缩进块内容。'); if (line!.text === '-' || line!.text.startsWith('- ')) sequence(indent, depth); else mapping(indent, depth) }
  const mapping = (indent: number, depth: number, firstLine?: Line): void => {
    writer.write('{'); let first = true; const keys = new Set<string>(); let line = firstLine
    while (line || current && current.indent === indent && current.text !== '-' && !current.text.startsWith('- ')) {
      const item = line ?? current!; const parsed = entry(item); if (keys.has(parsed.key)) fail(item.number, parsed.column, `重复键“${parsed.key}”不受支持。`); keys.add(parsed.key)
      if (!line) advance(); line = undefined; separator(depth, first); first = false; writer.write(JSON.stringify(parsed.key)); writer.write(': ')
      if (parsed.value) { const value = scalar(parsed.value, item.number, parsed.column + parsed.key.length + 1); writer.write(value.startsWith('[') || value.startsWith('{') ? value.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`) : value) }
      else if (current && current.indent > indent) block(current.indent, depth + 1)
      else writer.write('null')
      if (current && current.indent > indent) fail(current.number, indent + 1, '缩进层级不正确。')
    }
    if (!first) writer.write(`\n${'  '.repeat(depth)}`); writer.write('}')
  }
  const sequence = (indent: number, depth: number): void => {
    writer.write('['); let first = true
    while (current && current.indent === indent && (current.text === '-' || current.text.startsWith('- '))) {
      const item = current; const value = item.text.slice(1).trimStart(); advance(); separator(depth, first); first = false
      if (!value) { if (current && current.indent > indent) block(current.indent, depth + 1); else writer.write('null'); continue }
      if (findColon(value) >= 0) { const virtual = { ...item, text: value }; mapping(indent + 2, depth + 1, virtual) }
      else { const rendered = scalar(value, item.number, item.indent + 3); writer.write(rendered.startsWith('[') || rendered.startsWith('{') ? rendered.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`) : rendered) }
      if (current && current.indent > indent) fail(current.number, indent + 1, '序列项缩进不正确。')
    }
    if (!first) writer.write(`\n${'  '.repeat(depth)}`); writer.write(']')
  }
  advance(); if (!current) fail(1, 1, '请输入 YAML。'); const rootIndent = current!.indent; block(rootIndent, 0); if (current) fail(current.number, current.indent + 1, 'YAML 结构不完整。')
  return writer.finish()
}

function uncomment(text: string): string { let quote = ''; for (let index = 0; index < text.length; index += 1) { const char = text[index]; if (quote) { if (char === quote && text[index - 1] !== '\\') quote = ''; continue }; if (char === '"' || char === "'") quote = char; else if (char === '#' && (index === 0 || /\s/.test(text[index - 1]))) return text.slice(0, index) }; return text }
