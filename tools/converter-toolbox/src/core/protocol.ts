import type { ErrorLocation } from './errors.ts'
import type { Result } from './operations.ts'

export type OperationId =
  | 'format'
  | 'minify'
  | 'escape'
  | 'unescape'
  | 'query'
  | 'url'
  | 'java'
  | 'json-yaml'
  | 'yaml-json'
  | 'yaml-format'
export type OperationOptions = {
  indent?: '2' | '4' | 'tab'
  escapeNonAscii?: boolean
  rootClassName?: string
  packageName?: string
  jackson?: boolean
  lombok?: boolean
}
export type OperationRequest = {
  id: number
  operation: OperationId
  input: string
  options: OperationOptions
}
export type OperationFailure = { code: string; message: string; location?: ErrorLocation }
export type OperationResponse =
  { id: number; ok: true; result: Result } | { id: number; ok: false; error: OperationFailure }
