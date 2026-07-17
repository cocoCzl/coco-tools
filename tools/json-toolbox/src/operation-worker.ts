/// <reference lib="webworker" />

import { toErrorMessage } from './core/errors.ts'
import { executeOperation, type OperationRequest } from './core/operations.ts'

type WorkerInput = { taskId: number; request: OperationRequest }
type WorkerOutput =
  | { taskId: number; ok: true; result: ReturnType<typeof executeOperation> }
  | { taskId: number; ok: false; error: string }

self.addEventListener('message', (event: MessageEvent<WorkerInput>) => {
  const { taskId, request } = event.data
  try {
    const message: WorkerOutput = { taskId, ok: true, result: executeOperation(request) }
    self.postMessage(message)
  } catch (error) {
    const message: WorkerOutput = { taskId, ok: false, error: toErrorMessage(error) }
    self.postMessage(message)
  }
})
