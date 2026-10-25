import { ToolError, type ErrorLocation } from './errors.ts'
import { LimitedWriter, MAX_NESTING_DEPTH } from './limits.ts'

type Indent = 2 | 4 | 'tab'

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

export function formatJson(
  source: string,
  indent: Indent = 2,
  maxDepth = MAX_NESTING_DEPTH,
): string {
  return new StreamingFormatter(
    source,
    indent === 'tab' ? '\t' : ' '.repeat(indent),
    false,
    maxDepth,
  ).run()
}

export function minifyJson(source: string, maxDepth = MAX_NESTING_DEPTH): string {
  return new StreamingFormatter(source, '', true, maxDepth).run()
}

class StreamingFormatter {
  private index = 0
  private readonly writer = new LimitedWriter()
  private readonly source: string
  private readonly indent: string
  private readonly compact: boolean
  private readonly maxDepth: number

  constructor(source: string, indent: string, compact: boolean, maxDepth: number) {
    this.source = source
    this.indent = indent
    this.compact = compact
    this.maxDepth = maxDepth
  }

  run(): string {
    this.skipWhitespace()
    if (this.index >= this.source.length) this.fail('EMPTY_INPUT', '请输入 JSON。')
    this.value(0)
    this.skipWhitespace()
    if (this.index !== this.source.length)
      this.fail('TRAILING_CONTENT', 'JSON 根节点结束后存在多余内容。')
    return this.writer.finish()
  }

  private value(depth: number): void {
    if (
      depth > this.maxDepth ||
      (depth === this.maxDepth &&
        (this.source[this.index] === '[' || this.source[this.index] === '{'))
    )
      this.fail('MAX_DEPTH_EXCEEDED', `JSON 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`)
    const char = this.source[this.index]
    if (char === '{') return this.object(depth + 1)
    if (char === '[') return this.array(depth + 1)
    if (char === '"') {
      this.writer.write(this.string().raw)
      return
    }
    if (char === 't') return this.literal('true')
    if (char === 'f') return this.literal('false')
    if (char === 'n') return this.literal('null')
    if (char === '-' || isDigit(char)) {
      this.writer.write(this.number())
      return
    }
    if (char === "'") this.fail('SINGLE_QUOTE', 'JSON 字符串必须使用双引号。')
    if (char === undefined) this.fail('UNEXPECTED_END', 'JSON 意外结束。')
    this.fail('UNEXPECTED_TOKEN', `无法识别的字符“${char}”。`)
  }

  private object(depth: number): void {
    this.index += 1
    this.writer.write('{')
    this.skipWhitespace()
    if (this.source[this.index] === '}') {
      this.index += 1
      this.writer.write('}')
      return
    }
    const keys = new Set<string>()
    let first = true
    while (true) {
      if (this.source[this.index] !== '"') this.fail('OBJECT_KEY', '对象字段名必须是双引号字符串。')
      const keyStart = this.index
      const key = this.string()
      if (keys.has(key.value))
        this.failAt('DUPLICATE_KEY', `字段“${key.value}”重复出现。`, keyStart)
      keys.add(key.value)
      this.skipWhitespace()
      if (this.source[this.index] !== ':') this.fail('EXPECTED_COLON', '字段名后缺少冒号。')
      this.index += 1
      if (!first) this.writer.write(',')
      if (!this.compact) this.writer.write(`\n${this.indent.repeat(depth)}`)
      this.writer.write(key.raw)
      this.writer.write(this.compact ? ':' : ': ')
      this.skipWhitespace()
      this.value(depth)
      this.skipWhitespace()
      first = false
      const char = this.source[this.index]
      if (char === '}') {
        this.index += 1
        if (!this.compact) this.writer.write(`\n${this.indent.repeat(depth - 1)}`)
        this.writer.write('}')
        return
      }
      if (char !== ',') this.fail('EXPECTED_COMMA', '对象字段之间缺少逗号。')
      this.index += 1
      this.skipWhitespace()
      if (this.source[this.index] === '}') this.fail('TRAILING_COMMA', '对象末尾不能包含多余逗号。')
    }
  }

  private array(depth: number): void {
    this.index += 1
    this.writer.write('[')
    this.skipWhitespace()
    if (this.source[this.index] === ']') {
      this.index += 1
      this.writer.write(']')
      return
    }
    let first = true
    while (true) {
      if (!first) this.writer.write(',')
      if (!this.compact) this.writer.write(`\n${this.indent.repeat(depth)}`)
      this.value(depth)
      this.skipWhitespace()
      first = false
      const char = this.source[this.index]
      if (char === ']') {
        this.index += 1
        if (!this.compact) this.writer.write(`\n${this.indent.repeat(depth - 1)}`)
        this.writer.write(']')
        return
      }
      if (char !== ',') this.fail('EXPECTED_COMMA', '数组元素之间缺少逗号。')
      this.index += 1
      this.skipWhitespace()
      if (this.source[this.index] === ']') this.fail('TRAILING_COMMA', '数组末尾不能包含多余逗号。')
    }
  }

  private string(): { raw: string; value: string } {
    const start = this.index++
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index)
      const char = this.source[this.index]
      if (char === '"') {
        this.index += 1
        const raw = this.source.slice(start, this.index)
        try {
          return { raw, value: JSON.parse(raw) as string }
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
          if (!/^[0-9a-fA-F]{4}$/.test(digits))
            this.fail('INVALID_UNICODE_ESCAPE', 'Unicode 转义必须包含 4 位十六进制数字。')
          this.index += 5
          continue
        }
        this.fail('INVALID_ESCAPE', `不支持的转义序列“\\${escape}”。`)
      }
      this.index += 1
    }
    this.failAt('UNTERMINATED_STRING', '字符串缺少结束双引号。', start)
  }

  private number(): string {
    const start = this.index
    if (this.source[this.index] === '-') this.index += 1
    if (this.source[this.index] === '0') {
      this.index += 1
      if (isDigit(this.source[this.index])) this.fail('LEADING_ZERO', '数字不能包含多余的前导零。')
    } else {
      if (!isNonZeroDigit(this.source[this.index]))
        this.fail('INVALID_NUMBER', '负号后必须是数字。')
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
    return this.source.slice(start, this.index)
  }

  private literal(raw: 'true' | 'false' | 'null'): void {
    if (this.source.slice(this.index, this.index + raw.length) !== raw)
      this.fail('INVALID_LITERAL', `无效字面量，应为 ${raw}。`)
    this.index += raw.length
    this.writer.write(raw)
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
