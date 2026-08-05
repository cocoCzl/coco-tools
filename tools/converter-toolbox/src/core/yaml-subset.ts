import { ToolError } from './errors.ts'

type Line = { number: number; indent: number; text: string }

export function parseYamlSubset(source: string): unknown {
  const lines = tokenize(source)
  if (!lines.length) throw fail(1, 1, '请输入 YAML。')
  let index = 0
  const block = (indent: number): unknown => {
    const line = lines[index]
    if (!line || line.indent < indent) throw fail(line?.number ?? 1, 1, '缺少缩进块内容。')
    return line.text === '-' || line.text.startsWith('- ') ? sequence(indent) : mapping(indent)
  }
  const mapping = (indent: number, target: Record<string, unknown> = {}): Record<string, unknown> => {
    while (index < lines.length) {
      const line = lines[index]
      if (line.indent < indent) break
      if (line.indent > indent) throw fail(line.number, indent + 1, '缩进层级不正确。')
      if (line.text === '-' || line.text.startsWith('- ')) break
      const entry = keyValue(line)
      if (Object.hasOwn(target, entry.key)) throw fail(line.number, entry.column, `重复键“${entry.key}”不受支持。`)
      index += 1
      if (entry.value === '') {
        target[entry.key] = index < lines.length && lines[index].indent > indent ? block(lines[index].indent) : null
      } else target[entry.key] = scalar(entry.value, line.number, entry.column + entry.key.length + 1)
    }
    return target
  }
  const sequence = (indent: number): unknown[] => {
    const result: unknown[] = []
    while (index < lines.length) {
      const line = lines[index]
      if (line.indent < indent) break
      if (line.indent > indent) throw fail(line.number, indent + 1, '序列项缩进不正确。')
      if (line.text !== '-' && !line.text.startsWith('- ')) break
      const value = line.text.slice(1).trimStart(); index += 1
      if (!value) { result.push(index < lines.length && lines[index].indent > indent ? block(lines[index].indent) : null); continue }
      if (hasKeyValue(value)) {
        const virtual: Line = { ...line, text: value }
        const first = keyValue(virtual); const object: Record<string, unknown> = {}
        if (first.value === '') object[first.key] = index < lines.length && lines[index].indent > indent + 2 ? block(lines[index].indent) : null
        else object[first.key] = scalar(first.value, line.number, first.column + first.key.length + 1)
        if (index < lines.length && lines[index].indent === indent + 2 && !(lines[index].text === '-' || lines[index].text.startsWith('- '))) mapping(indent + 2, object)
        result.push(object)
      } else result.push(scalar(value, line.number, line.indent + 3))
    }
    return result
  }
  const value = block(lines[0].indent)
  if (index !== lines.length) throw fail(lines[index].number, lines[index].indent + 1, 'YAML 结构不完整。')
  return value
}

export function stringifyYamlSubset(value: unknown): string { return render(value, 0) + '\n' }

function tokenize(source: string): Line[] {
  const output: Line[] = []
  for (const [offset, raw] of source.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (/\t/.test(raw.match(/^\s*/)?.[0] ?? '')) throw fail(offset + 1, 1, 'YAML 缩进不能使用 Tab。')
    const clean = uncomment(raw).trimEnd(); if (!clean.trim()) continue
    const indent = clean.length - clean.trimStart().length; const text = clean.slice(indent)
    if (/^(---|\.\.\.)(?:\s|$)/.test(text)) throw fail(offset + 1, indent + 1, 'YAML 多文档暂不支持。')
    if (/(^|\s)[&*][\w-]+|(^|\s)!\S|(^|\s)<<\s*:/.test(text)) throw fail(offset + 1, indent + 1, 'YAML 锚点、别名、标签和合并键暂不支持。')
    if (/^[|>][-+]?/.test(text) || /:\s*[|>][-+]?\s*$/.test(text)) throw fail(offset + 1, indent + 1, 'YAML 块文本暂不支持。')
    output.push({ number: offset + 1, indent, text })
  }
  return output
}
function uncomment(text: string): string { let quote = ''; for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (quote) { if (char === quote && text[i - 1] !== '\\') quote = ''; continue }; if (char === '"' || char === "'") quote = char; else if (char === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i) }; return text }
function hasKeyValue(text: string): boolean { return findColon(text) >= 0 }
function keyValue(line: Line): { key: string; value: string; column: number } { const at = findColon(line.text); if (at < 0) throw fail(line.number, line.indent + 1, '映射项必须包含冒号。'); const raw = line.text.slice(0, at).trim(); if (!raw || raw.startsWith('[') || raw.startsWith('{')) throw fail(line.number, line.indent + 1, '复杂 YAML 键暂不支持。'); const key = scalar(raw, line.number, line.indent + 1); if (typeof key !== 'string') throw fail(line.number, line.indent + 1, 'YAML 映射键必须是字符串。'); return { key, value: line.text.slice(at + 1).trim(), column: line.indent + 1 } }
function findColon(text: string): number { let quote = ''; for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (quote) { if (char === quote && text[i - 1] !== '\\') quote = ''; continue }; if (char === '"' || char === "'") quote = char; else if (char === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]))) return i }; return -1 }
function scalar(raw: string, line: number, column: number): unknown {
  const value = raw.trim(); if (!value) return ''
  if (value.startsWith('"')) { try { const parsed = JSON.parse(value); if (typeof parsed !== 'string') throw new Error(); return parsed } catch { throw fail(line, column, '双引号字符串无效。') } }
  if (value.startsWith("'")) { if (!value.endsWith("'") || value.length === 1) throw fail(line, column, '单引号字符串无效。'); return value.slice(1, -1).replace(/''/g, "'") }
  if (value.startsWith('[') || value.startsWith('{')) { try { return JSON.parse(value) } catch { throw fail(line, column, '流式集合仅支持严格 JSON 写法。') } }
  if (/^(?:null|~)$/i.test(value)) return null
  if (/^(?:true|false)$/i.test(value)) return value.toLowerCase() === 'true'
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return Number(value)
  if (/^(?:yes|no|on|off|\.nan|[+-]?\.inf)$/i.test(value)) throw fail(line, column, 'YAML 隐式类型不属于 JSON 兼容子集。')
  return value
}
function render(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth); if (Array.isArray(value)) { if (!value.length) return '[]'; return value.map((item) => scalarValue(item) !== undefined ? `${pad}- ${scalarValue(item)}` : `${pad}-\n${render(item, depth + 1)}`).join('\n') }
  if (value && typeof value === 'object') { const entries = Object.entries(value as Record<string, unknown>); if (!entries.length) return '{}'; return entries.map(([key, item]) => scalarValue(item) !== undefined ? `${pad}${keyValueOut(key)}: ${scalarValue(item)}` : `${pad}${keyValueOut(key)}:\n${render(item, depth + 1)}`).join('\n') }
  return `${pad}${scalarValue(value)}`
}
function scalarValue(value: unknown): string | undefined { if (value === null) return 'null'; if (typeof value === 'boolean' || typeof value === 'number') return String(value); if (typeof value === 'string') return /^[A-Za-z_][\w ./-]*$/.test(value) && !/^(?:null|true|false|yes|no|on|off)$/i.test(value) ? value : JSON.stringify(value); return undefined }
function keyValueOut(key: string): string { return /^[A-Za-z_][\w ./-]*$/.test(key) ? key : JSON.stringify(key) }
function fail(line: number, column: number, message: string): ToolError { return new ToolError('YAML_SUBSET', message, { index: 0, line, column }) }
