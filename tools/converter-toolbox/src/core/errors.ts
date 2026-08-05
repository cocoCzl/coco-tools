export type ErrorLocation = {
  index: number
  line: number
  column: number
}

export class ToolError extends Error {
  readonly code: string
  readonly location?: ErrorLocation

  constructor(code: string, message: string, location?: ErrorLocation) {
    super(message)
    this.name = 'ToolError'
    this.code = code
    this.location = location
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ToolError && error.location) {
    return `第 ${error.location.line} 行，第 ${error.location.column} 列：${error.message}`
  }
  return error instanceof Error ? error.message : '发生未知错误。'
}

