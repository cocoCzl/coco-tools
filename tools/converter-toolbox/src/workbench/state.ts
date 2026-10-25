import type { ErrorLocation } from '../core/errors'
import type { Result } from '../core/operations'
import type { OperationId } from '../core/protocol'

export type ModuleId = 'json-format' | 'json-escape' | 'url' | 'java' | 'yaml' | 'timestamp'
export type TextModuleId = Exclude<ModuleId, 'timestamp'>
export type Status = 'idle' | 'running' | 'success' | 'error' | 'cancelled'
export type TextSession = {
  input: string
  result?: Result
  operation: OperationId
  ascii: boolean
  revision: number
  status: Status
  message: string
  location?: ErrorLocation
}
export const operationsByModule: Record<TextModuleId, Array<{ id: OperationId; label: string }>> = {
  'json-format': [
    { id: 'format', label: '格式化' },
    { id: 'minify', label: '压缩' },
  ],
  'json-escape': [
    { id: 'escape', label: '转义' },
    { id: 'unescape', label: '反转义' },
  ],
  url: [
    { id: 'query', label: 'URL → JSON' },
    { id: 'url', label: 'JSON → URL' },
  ],
  java: [{ id: 'java', label: '生成 Java' }],
  yaml: [
    { id: 'json-yaml', label: 'JSON → YAML' },
    { id: 'yaml-json', label: 'YAML → JSON' },
    { id: 'yaml-format', label: 'YAML 格式化' },
  ],
}
export function createSessions(): Record<TextModuleId, TextSession> {
  return Object.fromEntries(
    Object.entries(operationsByModule).map(([id, operations]) => [
      id,
      {
        input: '',
        operation: operations[0].id,
        ascii: false,
        revision: 0,
        status: 'idle',
        message: '就绪',
      },
    ]),
  ) as Record<TextModuleId, TextSession>
}
