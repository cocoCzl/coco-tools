import { ToolError } from './errors.ts'

export const INPUT_LIMIT_BYTES = 20 * 1024 * 1024
export const OUTPUT_LIMIT_BYTES = 40 * 1024 * 1024
export const MAX_NESTING_DEPTH = 512

export function utf8Bytes(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index += 1 }
    else bytes += 3
  }
  return bytes
}

export function assertInputLimit(value: string): void {
  if (utf8Bytes(value) > INPUT_LIMIT_BYTES) throw new ToolError('INPUT_TOO_LARGE', '输入不能超过 20 MiB。')
}

export function assertOutputLimit(value: string): void {
  if (utf8Bytes(value) > OUTPUT_LIMIT_BYTES) throw new ToolError('OUTPUT_TOO_LARGE', '转换结果超过 40 MiB，请缩小输入后重试。')
}

/** Collects output in medium chunks so token-heavy documents do not create millions of strings. */
export class LimitedWriter {
  private readonly chunks: string[] = []
  private buffer: string[] = []
  private bufferLength = 0
  private bytes = 0

  write(value: string): void {
    this.buffer.push(value)
    this.bufferLength += value.length
    if (this.bufferLength >= 64 * 1024) this.flush()
  }

  finish(): string {
    this.flush()
    return this.chunks.join('')
  }

  private flush(): void {
    if (!this.bufferLength) return
    const chunk = this.buffer.join('')
    this.bytes += utf8Bytes(chunk)
    if (this.bytes > OUTPUT_LIMIT_BYTES) throw new ToolError('OUTPUT_TOO_LARGE', '转换结果超过 40 MiB，请缩小输入后重试。')
    this.chunks.push(chunk)
    this.buffer = []
    this.bufferLength = 0
  }
}
