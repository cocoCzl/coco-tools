import { performance } from 'node:perf_hooks'
import { formatJson, generateJava, jsonToYaml, yamlToJson } from '../src/core/operations.ts'

const name = process.argv[2]
const bytes = Number(process.argv[3] ?? 20_000_000)
if (
  !['format', 'java', 'json-yaml', 'yaml-json'].includes(name) ||
  ![1_000_000, 10_000_000, 20_000_000].includes(bytes)
)
  throw new Error('请指定受支持的转换操作及 1000000、10000000 或 20000000 字节规模。')
const jsonRow = '{"id":123456,"name":"converter-toolbox","items":[1,2,3],"enabled":true}'
const yamlRow = '- id: 123456\n  name: converter-toolbox\n  items: [1, 2, 3]\n  enabled: true\n'
const json = `[${Array(Math.floor(bytes / (jsonRow.length + 1)))
  .fill(jsonRow)
  .join(',')}]`
const yaml = yamlRow.repeat(Math.floor(bytes / yamlRow.length))
global.gc?.()
const before = process.memoryUsage().heapUsed
const started = performance.now()
const output =
  name === 'format'
    ? formatJson(json).output
    : name === 'java'
      ? generateJava(json).output
      : name === 'json-yaml'
        ? jsonToYaml(json).output
        : name === 'yaml-json'
          ? yamlToJson(yaml).output
          : ''
const elapsed = performance.now() - started
const heap = Math.max(0, process.memoryUsage().heapUsed - before)
console.log(
  JSON.stringify({
    name,
    elapsed,
    heap,
    inputBytes: Buffer.byteLength(name === 'yaml-json' ? yaml : json),
    outputBytes: Buffer.byteLength(output),
  }),
)
