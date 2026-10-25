import { runOperation } from './core/operations'
import { ToolError } from './core/errors'
import type { OperationRequest, OperationResponse } from './core/protocol'

self.onmessage = (event: MessageEvent<OperationRequest>) => {
  const { id, operation, input, options } = event.data
  let response: OperationResponse
  try {
    response = { id, ok: true, result: runOperation(operation, input, options) }
  } catch (error) {
    response = {
      id,
      ok: false,
      error:
        error instanceof ToolError
          ? { code: error.code, message: error.message, location: error.location }
          : { code: 'UNKNOWN', message: error instanceof Error ? error.message : '发生未知错误。' },
    }
  }
  self.postMessage(response)
}
