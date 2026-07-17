import { escapeJsonString, unescapeJsonString } from './escape.ts'
import { formatJson, minifyJson } from './json.ts'
import { generateJavaDataClass, type JavaGeneratorOptions } from './java.ts'
import { jsonToQuery, queryToJson } from './url.ts'

export type OperationName =
  | 'format'
  | 'minify'
  | 'escape'
  | 'unescape'
  | 'query-to-json'
  | 'json-to-query'
  | 'generate-java'

export type OperationRequest = {
  operation: OperationName
  input: string
  options?: Record<string, unknown>
}

export type OperationResponse = {
  output: string
  warnings: string[]
  fileName?: string
}

export function executeOperation(request: OperationRequest): OperationResponse {
  switch (request.operation) {
    case 'format':
      return { output: formatJson(request.input, indentOption(request.options?.indent)), warnings: [] }
    case 'minify':
      return { output: minifyJson(request.input), warnings: [] }
    case 'escape':
      return { output: escapeJsonString(request.input, request.options?.escapeNonAscii === true), warnings: [] }
    case 'unescape':
      return { output: unescapeJsonString(request.input), warnings: [] }
    case 'query-to-json':
      return queryToJson(request.input)
    case 'json-to-query':
      return jsonToQuery(request.input)
    case 'generate-java':
      return generateJavaDataClass(request.input, request.options as JavaGeneratorOptions)
  }
}

export function recommendedOperation(input: string): OperationName | undefined {
  const value = input.trim()
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value) || value.startsWith('?')) return 'query-to-json'
  return undefined
}

function indentOption(value: unknown): 2 | 4 | 'tab' {
  return value === 4 || value === 'tab' ? value : 2
}
