import { ToolError } from '../core/errors'
import type { Result } from '../core/operations'
import type { OperationId, OperationOptions, OperationResponse } from '../core/protocol'

let requestId = 0
export type Task = { promise: Promise<Result>; cancel: () => void }
export function workerOperation(
  operation: OperationId,
  input: string,
  options: OperationOptions,
): Task {
  let cancel = () => {}
  const promise = new Promise<Result>((resolve, reject) => {
    let worker: Worker | undefined
    let settled = false
    const finish = () => {
      if (settled) return false
      settled = true
      worker?.terminate()
      return true
    }
    cancel = () => {
      if (finish()) reject(new ToolError('CANCELLED', '任务已取消。'))
    }
    try {
      worker = new Worker(new URL('../operation-worker.ts', import.meta.url), { type: 'module' })
      const id = ++requestId
      worker.onmessage = (event: MessageEvent<OperationResponse>) => {
        if (event.data.id !== id || !finish()) return
        if (event.data.ok) resolve(event.data.result)
        else
          reject(
            new ToolError(
              event.data.error.code,
              event.data.error.message,
              event.data.error.location,
            ),
          )
      }
      worker.onerror = () => {
        if (finish()) reject(new ToolError('WORKER_FAILED', '后台任务执行失败，请重试。'))
      }
      worker.onmessageerror = () => {
        if (finish()) reject(new ToolError('WORKER_MESSAGE', '无法读取后台任务结果，请重试。'))
      }
      worker.postMessage({ id, operation, input, options })
    } catch (error) {
      if (finish()) reject(error)
    }
  })
  return { promise, cancel }
}
