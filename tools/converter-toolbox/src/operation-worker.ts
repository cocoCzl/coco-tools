import { runOperation } from './core/operations'

self.onmessage = (event: MessageEvent<{ id: number; operation: string; input: string; options: Record<string, unknown> }>) => {
  const { id, operation, input, options } = event.data
  try {
    self.postMessage({ id, result: runOperation(operation, input, options) })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '发生未知错误。' })
  }
}
