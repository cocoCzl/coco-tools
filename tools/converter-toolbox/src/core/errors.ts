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
