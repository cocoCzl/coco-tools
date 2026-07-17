import { ToolError, type ErrorLocation } from './errors.ts'

type NodeBase = { start: number; end: number }

export type JsonStringNode = NodeBase & { kind: 'string'; raw: string; value: string }
export type JsonNumberNode = NodeBase & { kind: 'number'; raw: string }
export type JsonBooleanNode = NodeBase & { kind: 'boolean'; raw: 'true' | 'false'; value: boolean }
export type JsonNullNode = NodeBase & { kind: 'null'; raw: 'null' }
export type JsonArrayNode = NodeBase & { kind: 'array'; items: JsonNode[] }
export type JsonObjectEntry = {
  key: string
  keyRaw: string
  keyStart: number
  value: JsonNode
}
export type JsonObjectNode = NodeBase & { kind: 'object'; entries: JsonObjectEntry[] }
export type JsonNode =
  | JsonStringNode
  | JsonNumberNode
  | JsonBooleanNode
  | JsonNullNode
  | JsonArrayNode
  | JsonObjectNode

type Indent = 2 | 4 | 'tab'

class Parser {
  private index = 0
  private readonly source: string

  constructor(source: string) {
    this.source = source
  }

  parse(): JsonNode {
    this.skipWhitespace()
    if (this.index >= this.source.length) this.fail('EMPTY_INPUT', '请输入 JSON。')
    const node = this.parseValue()
    this.skipWhitespace()
    if (this.index !== this.source.length) {
      this.fail('TRAILING_CONTENT', 'JSON 根节点结束后存在多余内容。')
    }
    return node
  }

  private parseValue(): JsonNode {
    const char = this.source[this.index]
    if (char === '{') return this.parseObject()
    if (char === '[') return this.parseArray()
    if (char === '"') return this.parseString()
    if (char === 't') return this.parseLiteral('true', true)
    if (char === 'f') return this.parseLiteral('false', false)
    if (char === 'n') return this.parseNull()
    if (char === '-' || isDigit(char)) return this.parseNumber()
    if (char === "'") this.fail('SINGLE_QUOTE', 'JSON 字符串必须使用双引号。')
    if (char === undefined) this.fail('UNEXPECTED_END', 'JSON 意外结束。')
    this.fail('UNEXPECTED_TOKEN', `无法识别的字符“${char}”。`)
  }

  private parseObject(): JsonObjectNode {
    const start = this.index
    this.index += 1
    const entries: JsonObjectEntry[] = []
    const keys = new Map<string, number>()
    this.skipWhitespace()
    if (this.source[this.index] === '}') {
      this.index += 1
      return { kind: 'object', entries, start, end: this.index }
    }

    while (true) {
      if (this.source[this.index] !== '"') {
        this.fail('OBJECT_KEY', '对象字段名必须是双引号字符串。')
      }
      const keyNode = this.parseString()
      const previous = keys.get(keyNode.value)
      if (previous !== undefined) {
        this.failAt('DUPLICATE_KEY', `字段“${keyNode.value}”重复出现。`, keyNode.start)
      }
      keys.set(keyNode.value, keyNode.start)
      this.skipWhitespace()
      if (this.source[this.index] !== ':') this.fail('EXPECTED_COLON', '字段名后缺少冒号。')
      this.index += 1
      this.skipWhitespace()
      const value = this.parseValue()
      entries.push({ key: keyNode.value, keyRaw: keyNode.raw, keyStart: keyNode.start, value })
      this.skipWhitespace()
      const char = this.source[this.index]
      if (char === '}') {
        this.index += 1
        return { kind: 'object', entries, start, end: this.index }
      }
      if (char !== ',') this.fail('EXPECTED_COMMA', '对象字段之间缺少逗号。')
      this.index += 1
      this.skipWhitespace()
      if (this.source[this.index] === '}') this.fail('TRAILING_COMMA', '对象末尾不能包含多余逗号。')
    }
  }

  private parseArray(): JsonArrayNode {
    const start = this.index
    this.index += 1
    const items: JsonNode[] = []
    this.skipWhitespace()
    if (this.source[this.index] === ']') {
      this.index += 1
      return { kind: 'array', items, start, end: this.index }
    }

    while (true) {
      items.push(this.parseValue())
      this.skipWhitespace()
      const char = this.source[this.index]
      if (char === ']') {
        this.index += 1
        return { kind: 'array', items, start, end: this.index }
      }
      if (char !== ',') this.fail('EXPECTED_COMMA', '数组元素之间缺少逗号。')
      this.index += 1
      this.skipWhitespace()
      if (this.source[this.index] === ']') this.fail('TRAILING_COMMA', '数组末尾不能包含多余逗号。')
    }
  }

  private parseString(): JsonStringNode {
    const start = this.index
    this.index += 1
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index)
      const char = this.source[this.index]
      if (char === '"') {
        this.index += 1
        const raw = this.source.slice(start, this.index)
        try {
          return { kind: 'string', raw, value: JSON.parse(raw) as string, start, end: this.index }
        } catch {
          this.failAt('INVALID_STRING', '字符串包含无效 Unicode 转义。', start)
        }
      }
      if (code < 0x20) this.fail('CONTROL_CHARACTER', '字符串中包含未转义的控制字符。')
      if (char === '\\') {
        this.index += 1
        const escape = this.source[this.index]
        if (escape === undefined) this.fail('UNEXPECTED_END', '字符串转义意外结束。')
        if ('"\\/bfnrt'.includes(escape)) {
          this.index += 1
          continue
        }
        if (escape === 'u') {
          const digits = this.source.slice(this.index + 1, this.index + 5)
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
            this.fail('INVALID_UNICODE_ESCAPE', 'Unicode 转义必须包含 4 位十六进制数字。')
          }
          this.index += 5
          continue
        }
        this.fail('INVALID_ESCAPE', `不支持的转义序列“\\${escape}”。`)
      }
      this.index += 1
    }
    this.failAt('UNTERMINATED_STRING', '字符串缺少结束双引号。', start)
  }

  private parseNumber(): JsonNumberNode {
    const start = this.index
    if (this.source[this.index] === '-') this.index += 1
    if (this.source[this.index] === '0') {
      this.index += 1
      if (isDigit(this.source[this.index])) this.fail('LEADING_ZERO', '数字不能包含多余的前导零。')
    } else {
      if (!isNonZeroDigit(this.source[this.index])) this.fail('INVALID_NUMBER', '负号后必须是数字。')
      while (isDigit(this.source[this.index])) this.index += 1
    }
    if (this.source[this.index] === '.') {
      this.index += 1
      if (!isDigit(this.source[this.index])) this.fail('INVALID_NUMBER', '小数点后必须包含数字。')
      while (isDigit(this.source[this.index])) this.index += 1
    }
    if (this.source[this.index] === 'e' || this.source[this.index] === 'E') {
      this.index += 1
      if (this.source[this.index] === '+' || this.source[this.index] === '-') this.index += 1
      if (!isDigit(this.source[this.index])) this.fail('INVALID_NUMBER', '指数部分必须包含数字。')
      while (isDigit(this.source[this.index])) this.index += 1
    }
    return { kind: 'number', raw: this.source.slice(start, this.index), start, end: this.index }
  }

  private parseLiteral(raw: 'true' | 'false', value: boolean): JsonBooleanNode {
    const start = this.index
    if (this.source.slice(this.index, this.index + raw.length) !== raw) {
      this.fail('INVALID_LITERAL', `无效字面量，应为 ${raw}。`)
    }
    this.index += raw.length
    return { kind: 'boolean', raw, value, start, end: this.index }
  }

  private parseNull(): JsonNullNode {
    const start = this.index
    if (this.source.slice(this.index, this.index + 4) !== 'null') {
      this.fail('INVALID_LITERAL', '无效字面量，应为 null。')
    }
    this.index += 4
    return { kind: 'null', raw: 'null', start, end: this.index }
  }

  private skipWhitespace(): void {
    while (isWhitespace(this.source[this.index])) this.index += 1
  }

  private fail(code: string, message: string): never {
    this.failAt(code, message, this.index)
  }

  private failAt(code: string, message: string, index: number): never {
    throw new ToolError(code, message, locate(this.source, index))
  }
}

function isWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n'
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9'
}

function isNonZeroDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '1' && char <= '9'
}

export function locate(source: string, index: number): ErrorLocation {
  let line = 1
  let column = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { index, line, column }
}

export function parseJson(source: string): JsonNode {
  return new Parser(source).parse()
}

export function formatJson(source: string, indent: Indent = 2): string {
  return printJson(parseJson(source), indent === 'tab' ? '\t' : ' '.repeat(indent), 0, false)
}

export function minifyJson(source: string): string {
  return printJson(parseJson(source), '', 0, true)
}

function printJson(node: JsonNode, indent: string, depth: number, compact: boolean): string {
  if (node.kind === 'string' || node.kind === 'number' || node.kind === 'boolean' || node.kind === 'null') {
    return node.raw
  }
  if (node.kind === 'array') {
    if (node.items.length === 0) return '[]'
    if (compact) return `[${node.items.map((item) => printJson(item, indent, depth + 1, true)).join(',')}]`
    const pad = indent.repeat(depth + 1)
    const close = indent.repeat(depth)
    return `[\n${pad}${node.items.map((item) => printJson(item, indent, depth + 1, false)).join(`,\n${pad}`)}\n${close}]`
  }
  if (node.entries.length === 0) return '{}'
  if (compact) {
    return `{${node.entries.map((entry) => `${entry.keyRaw}:${printJson(entry.value, indent, depth + 1, true)}`).join(',')}}`
  }
  const pad = indent.repeat(depth + 1)
  const close = indent.repeat(depth)
  return `{\n${pad}${node.entries.map((entry) => `${entry.keyRaw}: ${printJson(entry.value, indent, depth + 1, false)}`).join(`,\n${pad}`)}\n${close}}`
}
