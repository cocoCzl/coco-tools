import { ToolError } from './errors.ts'
import { parseJson } from './json.ts'

const shortEscapes: Record<number, string> = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
}

function unicodeEscape(code: number): string {
  return `\\u${code.toString(16).padStart(4, '0')}`
}

export function escapeJsonString(input: string, escapeNonAscii = false): string {
  let output = '"'
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    if (code === 0x22) output += '\\"'
    else if (code === 0x5c) output += '\\\\'
    else if (shortEscapes[code]) output += shortEscapes[code]
    else if (code < 0x20) output += unicodeEscape(code)
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += escapeNonAscii ? `${unicodeEscape(code)}${unicodeEscape(next)}` : input[index] + input[index + 1]
        index += 1
      } else {
        output += unicodeEscape(code)
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) output += unicodeEscape(code)
    else if (escapeNonAscii && code > 0x7f) output += unicodeEscape(code)
    else output += input[index]
  }
  return `${output}"`
}

export function unescapeJsonString(input: string): string {
  const node = parseJson(input)
  if (node.kind !== 'string') {
    throw new ToolError('EXPECTED_JSON_STRING', '反转义输入必须是包含外层双引号的 JSON 字符串。')
  }
  return node.value
}
